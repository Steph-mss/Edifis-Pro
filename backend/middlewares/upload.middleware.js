const fs = require('fs');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const rootDir = path.join(__dirname, '..');
    let uploadPath = path.join(rootDir, 'uploads');

    if (req.uploadType === 'profile') {
      uploadPath = path.join(uploadPath, 'profile_pictures');
    } else if (req.uploadType === 'construction') {
      uploadPath = path.join(uploadPath, 'construction_sites');
    }

    // Vérifie si le dossier existe, sinon crée-le
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${req.uploadType}-${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Format non supporté (Uniquement des images)'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: fileFilter,
});

const setUploadType = type => (req, res, next) => {
  req.uploadType = type;
  next();
};

// Middleware de gestion des erreurs Multer
const handleUploadError = (err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'Fichier trop volumineux. La taille maximale est de 5 MB.' });
  }
  if (err && err.message) {
    return res.status(400).json({ message: err.message });
  }
  next(err);
};

module.exports = { upload, setUploadType, handleUploadError };
