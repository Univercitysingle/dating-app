const fs = require('fs');
const path = require('path');

const uploadDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const saveFile = (fileContent, filename) => {
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, fileContent);
  return { Location: `/uploads/${filename}` };
};

const deleteFile = (filename) => {
  const filePath = path.join(uploadDir, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

module.exports = {
  saveFile,
  deleteFile,
};
