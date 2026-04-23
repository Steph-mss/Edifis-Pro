const sequelize = require('../config/sequelize');
const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const Task = require('../models/Task');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const Role = require('../models/Role');
const Competence = require('../models/Competence');
const { Op, literal } = require('sequelize');
const {
  hash: hashPassword,
  compare: comparePassword,
  validatePolicy,
} = require('../services/password.service');
const logger = require('../config/logger');

// Récupérer tous les utilisateurs sauf ceux avec `role_id = 1` (Responsables)
// Inscription (Création de compte avec JWT)
exports.createUser = async (req, res) => {
  try {
    const { firstname, lastname, email, password, numberphone, role, role_id, competences } =
      req.body;

    if (!firstname || !lastname || !email || !password) {
      return res.status(400).json({ message: 'Tous les champs obligatoires doivent être fournis' });
    }

    const requesterRole = req.user?.role;

    let final_role_id = role_id;
    if (role && !final_role_id) {
      const role_obj = await Role.findOne({ where: { name: role } });
      if (!role_obj) {
        return res.status(400).json({ message: `Le rôle '${role}' n'est pas valide.` });
      }
      final_role_id = role_obj.role_id;
    }
    if (!final_role_id) final_role_id = 2; // Worker par défaut

    // Vérifier si on tente de créer un Admin
    const targetRole = await Role.findByPk(final_role_id);
    if (targetRole?.name === 'Admin' && requesterRole !== 'Admin') {
      return res
        .status(403)
        .json({ message: 'Seul un administrateur peut créer un compte administrateur.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // 🔹 Créer l’utilisateur
    const newUser = await User.create({
      firstname,
      lastname,
      email,
      password: hashedPassword,
      numberphone,
      role_id: final_role_id,
    });

    // 🔹 Associer les compétences si envoyées
    if (Array.isArray(competences) && competences.length > 0) {
      const competenceIds = competences.map(c =>
        typeof c === 'object' && c !== null ? c.competence_id : c,
      );
      await newUser.setCompetences(competenceIds);
    }

    const userResponse = await User.findByPk(newUser.user_id, {
      attributes: ['user_id', 'firstname', 'lastname', 'email', 'numberphone'],
      include: [
        { model: Role, as: 'role', attributes: ['name'] },
        {
          model: Competence,
          as: 'competences',
          attributes: ['competence_id', 'name', 'description'],
          through: { attributes: [] },
        },
      ],
    });

    res.status(201).json({
      message: 'Utilisateur créé avec succès',
      user: userResponse || newUser,
    });
  } catch (error) {
    if (
      error.name === 'SequelizeUniqueConstraintError' ||
      (error.message && error.message.includes('UNIQUE'))
    ) {
      return res.status(409).json({ message: "L'email existe déjà" });
    }
    return res.status(500).json({ error: 'Création échouée' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      include: [{ model: Role, as: 'role', attributes: ['name'] }]
    });
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });

    const requesterRole = req.user?.role;
    const targetRoleName = user.role?.name;

    // Seul un Admin peut tout supprimer. Les autres ont des restrictions.
    if (requesterRole !== 'Admin') {
      if (targetRoleName === 'Admin') {
        return res.status(403).json({ message: "Vous n'avez pas l'autorisation de supprimer un administrateur." });
      }

      if (targetRoleName === 'HR' && (requesterRole === 'HR' || requesterRole === 'Manager')) {
        return res.status(403).json({ message: "Vous n'avez pas l'autorisation de supprimer un profil RH." });
      }

      if (targetRoleName === 'Manager' && requesterRole === 'Manager') {
        return res.status(403).json({ message: "Vous n'avez pas l'autorisation de supprimer un autre manager." });
      }
    }

    await user.destroy();
    res.json({ message: 'Utilisateur supprimé' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Récupérer tous les utilisateurs (sans afficher le mot de passe)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['user_id', 'firstname', 'lastname', 'email', 'numberphone', 'profile_picture'],
      include: [
        { model: Role, as: 'role', attributes: ['name'] },
        {
          model: Competence,
          as: 'competences',
          attributes: ['name', 'description'],
          through: { attributes: [] },
        },
      ],
    });

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllWorkers = async (req, res) => {
  try {
    const workers = await User.findAll({
      include: [
        {
          model: Role,
          as: 'role',
          attributes: ['name'],
        },
      ],
      where: { role_id: 2 }, // 2 = Worker
    });

    // Normaliser la réponse
    const formatted = workers.map(w => ({
      user_id: w.user_id,
      firstname: w.firstname,
      lastname: w.lastname,
      email: w.email,
      numberphone: w.numberphone,
      profile_picture: w.profile_picture,
      role: w.role?.name || 'Worker',
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Récupérer tous les chefs de projet (utilisateurs avec `role = Manager`)
exports.getAllManagers = async (req, res) => {
  try {
    const managers = await User.findAll({
      attributes: ['user_id', 'firstname', 'lastname', 'email', 'numberphone', 'profile_picture'],
      where: {
        role_id: 3, // 3 = Manager
      },
    });

    res.json(managers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllProjectChiefs = async (req, res) => {
  try {
    // Find the role IDs for Manager and Project_Chief
    const projectChiefRoles = await Role.findAll({
      where: {
        name: {
          [Op.in]: ['Manager', 'Project_Chief'],
        },
      },
      attributes: ['role_id'],
    });

    const roleIds = projectChiefRoles.map(role => role.role_id);

    if (roleIds.length === 0) {
      return res.json([]);
    }

    const chiefs = await User.findAll({
      attributes: ['user_id', 'firstname', 'lastname', 'email'],
      where: { role_id: { [Op.in]: roleIds } },
    });

    res.json(chiefs);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Récupérer un utilisateur par ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      include: [
        { model: Role, as: 'role', attributes: ['role_id', 'name'] },
        {
          model: Competence,
          as: 'competences',
          attributes: ['competence_id', 'name', 'description'],
          through: { attributes: [] },
        },
      ],
    });

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// util: resolve role name -> role_id
async function resolveRoleIdByName(roleName) {
  if (!roleName) return null;
  const found = await Role.findOne({ where: { name: roleName } });
  return found ? found.role_id : null;
}

// util: get role ids map { Admin: 7, Manager: 8, Worker: 9, ... }
async function getRoleIds() {
  const rows = await Role.findAll({ attributes: ['role_id', 'name'] });
  const map = {};
  for (const r of rows) map[r.name] = r.role_id;
  return map;
}

// Mettre à jour un utilisateur (avec hash si le mdp est modifié)
exports.updateUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      include: [{ model: Role, as: 'role', attributes: ['name', 'role_id'] }],
    });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    const requesterRole = req.user?.role;
    const requesterId = req.user?.id;
    const isSelf = String(requesterId) === String(user.user_id);

    // Protection des rangs (sauf auto-édition)
    if (!isSelf && requesterRole !== 'Admin') {
      const targetRoleName = user.role?.name;

      if (targetRoleName === 'Admin') {
        return res.status(403).json({ message: "Seul un administrateur peut modifier un compte administrateur." });
      }
      
      if (targetRoleName === 'HR' && (requesterRole === 'HR' || requesterRole === 'Manager')) {
        return res.status(403).json({ message: "Vous n'avez pas l'autorisation de modifier ce profil RH." });
      }

      if (targetRoleName === 'Manager' && requesterRole === 'Manager') {
        return res.status(403).json({ message: "Vous n'avez pas l'autorisation de modifier un autre manager." });
      }
    }

    const { competences, ...payload } = req.body;

    // Seul un Admin peut changer l'email
    if (requesterRole !== 'Admin') {
      delete payload.email;
    }

    if (payload.role && !payload.role_id) {
      // Empêcher de promouvoir Admin si on n'est pas Admin
      if (payload.role === 'Admin' && requesterRole !== 'Admin') {
        return res.status(403).json({ message: "Seul un administrateur peut promouvoir au rôle administrateur." });
      }

      const role = await Role.findOne({ where: { name: payload.role } });
      if (!role) {
        return res.status(400).json({ message: `Rôle '${payload.role}' invalide` });
      }
      payload.role_id = role.role_id;
      delete payload.role;
    }

    // Si role_id est fourni directement
    if (payload.role_id && requesterRole !== 'Admin') {
      const targetRole = await Role.findByPk(payload.role_id);
      if (targetRole?.name === 'Admin') {
        return res.status(403).json({ message: "Seul un administrateur peut promouvoir au rôle administrateur." });
      }
    }

    if (payload.password) {
      payload.password = await hashPassword(payload.password);
    }

    await user.update(payload);

    if (Array.isArray(competences)) {
      if (typeof user.setCompetences === 'function') {
        const competenceIds = competences.map(c =>
          typeof c === 'object' && c !== null ? c.competence_id : c,
        );
        await user.setCompetences(competenceIds);
      }
    }

    const updated = await User.findByPk(user.user_id, {
      attributes: ['user_id', 'firstname', 'lastname', 'email', 'numberphone', 'profile_picture'],
      include: [
        { model: Role, as: 'role', attributes: ['name'] },
        {
          model: Competence,
          as: 'competences',
          attributes: ['competence_id', 'name', 'description'],
          through: { attributes: [] },
        },
      ],
    });

    return res.json({
      message: 'Utilisateur mis à jour',
      user: {
        user_id: updated.user_id,
        firstname: updated.firstname,
        lastname: updated.lastname,
        email: updated.email,
        numberphone: updated.numberphone,
        profile_picture: updated.profile_picture,
        role: updated.role?.name || null,
        competences: updated.competences || [],
      },
    });
  } catch (error) {
    logger.error('Update user error:', { message: error.message, stack: error.stack });
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: "L'email existe déjà" });
    }
    return res.status(500).json({ error: error.message || 'Update error' });
  }
};
// >>> LISTE filtrée selon le rôle du demandeur
exports.getDirectory = async (req, res) => {
  try {
    const Role = require('../models/Role');
    const User = require('../models/User');
    const Competence = require('../models/Competence');

    const meRole = req.user?.role; // "Admin", "HR", "Manager", "Project_Chief", "Worker"

    // Politique d’affichage :
    // - Admin: tout le monde
    // - HR: tout le monde
    // - Manager/Project_Chief: seulement les Workers
    // - Worker: seulement lui-même
    let where = {};
    const workerRole = await Role.findOne({ where: { name: 'Worker' } });
    const userId = req.user.id || req.user.userId || req.user.user_id;

    if (meRole === 'Manager') {
      const chiefRole = await Role.findOne({ where: { name: 'Project_Chief' } });
      const allowedRoleIds = [workerRole?.role_id, chiefRole?.role_id].filter(id => id != null);
      where = { role_id: { [Op.in]: allowedRoleIds } };
    } else if (meRole === 'Project_Chief') {
      // Un chef de projet ne voit que les ouvriers travaillant sur ses chantiers
      where = {
        role_id: workerRole?.role_id || -1,
        [Op.and]: [
          literal(
            `EXISTS (SELECT 1 FROM user_tasks ut JOIN tasks t ON ut.task_id = t.task_id JOIN construction_site cs ON t.construction_site_id = cs.construction_site_id WHERE ut.user_id = User.user_id AND cs.chef_de_projet_id = ${userId})`,
          ),
        ],
      };
    } else if (meRole === 'Worker') {
      where = { user_id: userId };
    } // Admin/HR => pas de filtre

    const users = await User.findAll({
      where,
      attributes: [
        'user_id',
        'firstname',
        'lastname',
        'email',
        'numberphone',
        'profile_picture',
        'role_id',
      ],
      include: [
        { model: Role, as: 'role', attributes: ['name'] },
        {
          model: Competence,
          as: 'competences',
          attributes: ['competence_id', 'name', 'description'],
          through: { attributes: [] },
        },
      ],
      order: [
        ['lastname', 'ASC'],
        ['firstname', 'ASC'],
      ],
    });

    const normalized = users.map(u => ({
      ...u.toJSON(),
      role: u.role?.name || 'User',
    }));

    res.json(normalized);
  } catch (e) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Mettre à jour l’image de profil
exports.updateProfilePicture = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.user_id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Identification de l’utilisateur impossible.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Aucune image envoyée' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Supprimer l'ancienne image si elle existe
    if (user.profile_picture && typeof user.profile_picture === 'string' && !user.profile_picture.startsWith('http')) {
      // Extraire le nom du fichier si c'est un chemin complet
      const fileName = user.profile_picture.split('/').pop();
      const oldImagePath = path.join(__dirname, '../uploads/profile_pictures', fileName);
      
      try {
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      } catch (err) {
        console.error('Erreur lors de la suppression de l’ancienne image:', err);
      }
    }

    // Mettre à jour l'utilisateur avec la nouvelle image
    user.profile_picture = req.file.filename;
    await user.save();

    res.status(200).json({
      message: 'Image de profil mise à jour avec succès',
      profile_picture: user.profile_picture,
    });
  } catch (error) {
    console.error('Upload profile picture error:', error);
    res.status(500).json({ error: error.message });
  }
};

// POST /api/users/change-password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const policy = validatePolicy(newPassword);
    if (!policy.ok) {
      return res.status(400).json({ message: 'Erreur de validation', errors: policy.errors });
    }

    const userId = req.user?.id || req.user?.user_id || req.user?.userId;
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      return res.status(400).json({ message: 'Mot de passe actuel incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashed });
    return res.json({ message: 'Mot de passe mis à jour' });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Helpers simples pour normaliser le prénom/nom
function slugifyName(s = '') {
  return s
    .normalize('NFD') // supprime les accents
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9- ]/g, '') // garde lettres/chiffres/espaces/tirets
    .trim()
    .replace(/\s+/g, '.') // espaces -> point (au cas où)
    .toLowerCase();
}

exports.suggestEmail = async (req, res) => {
  try {
    const { firstname = '', lastname = '' } = req.body;

    const first = slugifyName(firstname);
    const last = slugifyName(lastname);
    if (!first) {
      return res.status(400).json({ message: 'firstname requis' });
    }

    const localPartBase = last ? `${first}.${last}` : first;
    const domain = 'edifis-pro.com';
    const finalLocalPart = localPartBase.replace(/\s/g, '');

    // On récupère tous les emails qui commencent par localPartBase
    // (ex: pierre.benoit@..., pierre.benoit2@..., pierre.benoit10@...)
    const likePrefix = `${finalLocalPart}%@${domain}`;
    const existing = await User.findAll({
      attributes: ['email'],
      where: { email: { [Op.like]: likePrefix } },
    });

    // Cherche le plus petit suffixe dispo (base, base2, base3, …)
    const used = new Set(
      existing.map(u => {
        const m = u.email.match(new RegExp(`^${finalLocalPart}(\d+)?@${domain}`));
        // m[1] contient le nombre si présent
        return m && m[1] ? parseInt(m[1], 10) : 0; // 0 = sans suffixe
      }),
    );

    let candidate = `${finalLocalPart}@${domain}`;
    if (used.has(0)) {
      // base déjà pris, on teste 2,3,4…
      let n = 2;
      while (used.has(n)) n++;
      candidate = `${finalLocalPart}${n}@${domain}`;
    }

    return res.json({ email: candidate });
  } catch (err) {
    return res.status(500).json({ error: "Erreur lors de la génération de l'email" });
  }
};

exports.assignCompetenceToUser = async (req, res) => {
  try {
    const { userId, competenceId } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const competence = await Competence.findByPk(competenceId);
    if (!competence) {
      return res.status(404).json({ message: 'Compétence non trouvée' });
    }

    await user.addCompetence(competence);

    res.json({ message: 'Compétence assignée avec succès' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAssignableUsers = async (req, res) => {
  try {
    const requesterRole = req.user.role;
    let rolesToFetch = [];

    if (requesterRole === 'Project_Chief') {
      rolesToFetch = ['Worker'];
    } else if (requesterRole === 'Manager') {
      rolesToFetch = ['Worker', 'Project_Chief', 'HR'];
    } else if (requesterRole === 'Admin') {
      // Admin can see everyone
    } else {
      // Other roles see no one for now
      return res.json([]);
    }

    let whereClause = {};
    if (rolesToFetch.length > 0) {
      const roles = await Role.findAll({
        where: { name: { [Op.in]: rolesToFetch } },
        attributes: ['role_id'],
      });
      const roleIds = roles.map(r => r.role_id);
      whereClause.role_id = { [Op.in]: roleIds };
    }

    const users = await User.findAll({
      where: whereClause,
      include: [{ model: Role, as: 'role', attributes: ['name'] }],
      attributes: ['user_id', 'firstname', 'lastname', 'email'],
    });

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
};
