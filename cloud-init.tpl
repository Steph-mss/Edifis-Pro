#cloud-config
package_update: true
package_upgrade: true

packages:
  - ca-certificates
  - curl
  - gnupg
  - lsb-release
  - git
  - nginx

write_files:
  - path: /etc/nginx/sites-available/edifis-pro
    permissions: '0644'
    content: |
${indent(6, nginx_conf)}

runcmd:
  - mkdir -p /opt/edifis-pro
  - mkdir -p /opt/edifis-pro/backend/uploads
  - mkdir -p /etc/apt/keyrings
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  - chmod a+r /etc/apt/keyrings/docker.gpg
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  - apt-get update
  - apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  - systemctl enable docker
  - systemctl start docker
  - usermod -aG docker azureuser
  - rm -f /etc/nginx/sites-enabled/default
  - ln -s /etc/nginx/sites-available/edifis-pro /etc/nginx/sites-enabled/edifis-pro
  - nginx -t
  - systemctl enable nginx
  - systemctl restart nginx