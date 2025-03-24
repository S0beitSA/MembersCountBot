import fs from 'fs';

export const readJsonFile = (filePath) => {
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath));
};

export const writeJsonFile = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};
