import express from 'express';
import hbs from 'express-handlebars';
import formidable from 'formidable';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from "fs";
import mime from 'mime-types';
import sizeOf from 'image-size'

const PORT = 3000;
const MAX_FILENAME_LENGTH = 32;
const __dirname = import.meta.dirname;
const uploadPath = path.join(__dirname, 'upload');
const configPath = path.join(__dirname, 'config.json');

const DEFAULT_CONFIG = {
    theme: 'light',
    fontSize: 16,
}

const app = express();

app.use(express.static('static'));
app.use(express.static('upload'));

app.use(express.urlencoded({
    extended: true,
}))
app.use(express.json());

if (!existsSync(uploadPath)) {
    await fs.mkdir(uploadPath);
}

const asyncFilter = async (arr, predicate) => {
    const results = await Promise.all(arr.map(predicate));

    return arr.filter((_v, index) => results[index]);
}

const getUploadDirContent = async (currentPath) => {
    try {
        return await fs.readdir(currentPath);
    } catch (err) {
        throw err;
    }
}

const getCurrentPath = (currentDir) => {
    return path.join(uploadPath, ...(currentDir ?? '').split('/'));
}

const getDirs = async (currentDir) => {
    const currentPath = getCurrentPath(currentDir);

    try {
        const uploadDirContent = await getUploadDirContent(currentPath);

        const dirs = await asyncFilter(uploadDirContent, async (element) => {
            const elementPath = path.join(currentPath, element);
            const stats = await fs.lstat(elementPath);
            return stats.isDirectory();
        })

        return dirs;
    } catch (err) {
        throw err;
    }
}

const getFiles = async (currentDir) => {
    const currentPath = getCurrentPath(currentDir);

    try {
        const uploadDirContent = await getUploadDirContent(currentPath);

        const files = await asyncFilter(uploadDirContent, async (element) => {
            const elementPath = path.join(currentPath, element);
            const stats = await fs.lstat(elementPath);
            return stats.isFile();
        })

        return files;
    } catch (err) {
        throw err;
    }
}

const getNewFileName = async (originalFileName, currentDir) => {
    let { name: tmpFileName, ext } = path.parse(originalFileName);

    try {
        const existingFiles = await getFiles(currentDir);

        if (ext === '' || ext === '.') {
            ext = '.txt';
        }

        tmpFileName = tmpFileName.replaceAll(' ', '_');

        while (existingFiles.includes(`${tmpFileName}${ext}`)) {
            tmpFileName = `${tmpFileName}_copy_${Date.now()}`;
        }

        return `${tmpFileName}${ext}`;
    } catch (err) {
        throw err;
    }
}

const getSubDirs = (currentDir) => {
    if (currentDir === '/') {
        return [];
    }

    const subDirsNames = currentDir.split('/');
    subDirsNames.shift();

    const subDirs = subDirsNames.map((name, i) => {
        return {
            name,
            link: `${subDirsNames.slice(0, i).map(prevName => `/${prevName}`).join('')}/${name}`,
        };
    });

    return subDirs;
}

const checkInvalidCharacter = (name) => {
    return name.includes('/') || name.includes('<') || name.includes('>') || name.includes(':') || name.includes('"') || name.includes('\\') || name.includes('|') || name.includes('?') || name.includes('*');
}

const getParentPath = (currentPath) => {
    const splitted = currentPath.split(path.sep);

    splitted.pop();
    return `/${splitted.join('/')}`;
}

const getDefaultFileContent = (ext) => {
    if (ext === '.html') {
        return (
            `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
    
</body>
</html>`
        );
    }
    if (ext === '.css') {
        return (
            `*,
::before,
::after {
    box-sizing: border-box;
}`
        );
    }
    if (ext === '.js') {
        return (
            `const helloWorld = document.querySelector('#helloWorld');
console.log(helloWorld);`
        );
    }

    return '';
}

const getFileLink = (currentDir, fileName) => {
    const ext = path.extname(fileName);

    if (ext === '.html' || ext === '.css' || ext === '.js' || ext === '.txt' || ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        return `${currentDir}${currentDir === '/' ? '' : '/'}${fileName}`;
    }

    return null;
}

app.get('/', (_req, res) => {
    res.redirect('/filemanager');
})

app.get('/filemanager', async (req, res) => {
    const currentDir = req.query.name ?? '/';
    const subDirs = getSubDirs(currentDir);

    try {
        const dirs = (await getDirs(currentDir)).map((name) => {
            return {
                name,
                link: `${currentDir}${currentDir === '/' ? '' : '/'}${name}`,
                path: path.join(...currentDir.split('/'), name),
            };
        });
        const files = (await getFiles(currentDir)).map((name) => {
            return {
                name,
                link: getFileLink(currentDir, name),
                path: path.join(...currentDir.split('/'), name),
            };
        });

        res.render('filemanager.hbs', { dirs, files, subDirs, currentDir, isHome: !(currentDir !== '/' && currentDir !== '') });
    } catch (_err) {
        res.render('error.hbs', { message: `No such dir: ${currentDir}` });
    }
})

app.get('/showFile', async (req, res) => {
    const fileLink = req.query.name;
    const ext = path.extname(fileLink);

    if (ext === '.html' || ext === '.css' || ext === '.js' || ext === '.txt') {
        const file = (await fs.readFile(path.join(uploadPath, ...fileLink.split('/')))).toString();

        res.render('editor.hbs', { fileLink, file, DEFAULT_CONFIG });
        return;
    }

    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        const imagePath = getCurrentPath(fileLink);

        const filters = ['grayscale', 'invert', 'sepia'];
        const { width, height } = sizeOf(imagePath);

        res.render('image.hbs', { fileLink, imagePath, filters, imageSize: { width, height } });
        return;
    }

    res.render('error.hbs', { message: 'This file is not editable' })
})

app.get('/getConfig', async (_req, res) => {
    let config = null;
    try {
        config = JSON.parse((await fs.readFile(configPath)).toString());
    } catch (_error) {
        await fs.writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 4));
        config = JSON.parse((await fs.readFile(configPath)).toString());
    }

    res.json(config);
})

app.post('/setConfig', async (req, res) => {
    const { theme, fontSize } = req.body;

    await fs.writeFile(configPath, JSON.stringify({ theme, fontSize }, null, 4))

    res.status(200).send('ok');
})

app.post('/newDir', async (req, res) => {
    const { body: { dirName, currentDir } } = req;

    if (checkInvalidCharacter(dirName)) {
        res.render('error.hbs', { message: 'Invalid characters in dir name' });
        return;
    }

    let tmpDirName = dirName.replaceAll(' ', '_');

    try {
        const existingDirs = await getDirs(currentDir);
        const currentPath = getCurrentPath(currentDir);

        while (existingDirs.includes(tmpDirName)) {
            tmpDirName = `${dirName}_copy_${Date.now()}`;
        }

        const newDirPath = path.join(currentPath, tmpDirName);
        await fs.mkdir(newDirPath);

        const urlName = newDirPath.split('upload')[1]?.split(path.sep)?.join('/') ?? '/';

        res.redirect(`/filemanager?name=${urlName}`);
    } catch (_err) {
        res.render('error.hbs', { message: 'Something went wrong while creating the dir' });
    }
})

app.post('/newFile', async (req, res) => {
    const { body: { fileName, currentDir, ext } } = req;

    if (checkInvalidCharacter(fileName)) {
        res.render('error.hbs', { message: 'Invalid characters in file name' });
        return;
    }

    try {
        const newFileName = await getNewFileName(`${fileName}${ext}`, currentDir);

        const currentPath = getCurrentPath(currentDir);
        const newFilePath = path.join(currentPath, newFileName);

        await fs.writeFile(newFilePath, getDefaultFileContent(ext));
        const urlName = currentPath.split('upload')[1]?.split(path.sep)?.join('/') ?? '/';

        res.redirect(`/filemanager?name=${urlName}`);
    } catch (_err) {
        res.render('error.hbs', { message: 'Something went wrong while creating the file' });
    }

})

app.post('/upload', (req, res) => {
    let form = formidable({});
    form.uploadDir = uploadPath;
    form.keepExtensions = true;
    form.multiples = true;

    try {
        form.parse(req, async (_err, fields, { files: uploadContent }) => {
            const uploadedFiles = Array.isArray(uploadContent) ? [...uploadContent] : [uploadContent];
            const { currentDir } = fields;

            let invalidFiles = false;

            await Promise.all(uploadedFiles.map(async (file) => {
                if (checkInvalidCharacter(file.name)) {
                    invalidFiles = true;
                }
            }))

            if (!invalidFiles) {
                await Promise.all(uploadedFiles.map(async (file) => {
                    const fileName = await getNewFileName(file.name, currentDir);
                    const currentPath = path.join(uploadPath, ...currentDir.split('/'));
                    const newFilePath = path.join(currentPath, fileName);
                    await fs.rename(file.path, newFilePath);
                }))

                res.redirect(`/filemanager?name=${currentDir}`);
            } else {
                await Promise.all(uploadedFiles.map(async (file) => {
                    await fs.rm(file.path);
                }))

                res.render('error.hbs', { message: 'Invalid characters in uploaded files\' names' });
            }

        });
    } catch (err) {
        res.render('error.hbs', { message: 'Something went wrong while uploading files' });
    }
})

app.post('/removeDir', async (req, res) => {
    const { body: { dirPath } } = req;
    const toDelteDirPath = path.join(uploadPath, dirPath);

    await fs.rm(toDelteDirPath, { recursive: true });

    res.redirect(`/filemanager?name=${getParentPath(dirPath)}`);
})

app.post('/removeFile', async (req, res) => {
    const { body: { filePath } } = req;
    const toDelteFilePath = path.join(uploadPath, filePath);

    await fs.rm(toDelteFilePath);

    res.redirect(`/filemanager?name=${getParentPath(filePath)}`);
})

app.post('/changeDirName', async (req, res) => {
    const { body: { dirName, currentDir } } = req;

    if (checkInvalidCharacter(dirName)) {
        res.render('error.hbs', { message: 'Invalid characters in dir name' });
        return;
    }

    let tmpDirName = dirName.replaceAll(' ', '_');

    const parentDir = currentDir.split('/').slice(0, currentDir.split('/').length - 1).join('/');

    const existingDirs = await getDirs(parentDir);
    const parentPath = getCurrentPath(parentDir);
    const currentPath = getCurrentPath(currentDir);

    while (existingDirs.includes(tmpDirName)) {
        tmpDirName = `${dirName}_copy_${Date.now()}`;
    }

    const newDirPath = path.join(parentPath, tmpDirName);
    await fs.rename(currentPath, newDirPath);

    res.redirect(`/filemanager?name=${newDirPath.split('upload')[1]?.split(path.sep)?.join('/') ?? '/'}`);
})

app.post('/editFile', async (req, res) => {
    const { body: { fileContent, fileLink } } = req;

    const filePath = getCurrentPath(fileLink);
    await fs.writeFile(filePath, fileContent);

    const urlName = fileLink.split('/').slice(0, -1).join('/');

    res.redirect(`/filemanager?name=${urlName}`);
})

app.post('/renameFile', async (req, res) => {
    const { body: { fileName, fileLink } } = req;

    const ext = path.extname(fileLink);
    const filePath = getCurrentPath(fileLink);

    const newFileLink = [...fileLink.split('/').slice(0, -1), `${fileName}${ext}`].join('/');
    const newFilePath = getCurrentPath(newFileLink);

    await fs.rename(filePath, newFilePath);

    res.redirect(`/showFile?name=${newFileLink}`);
})

app.get('/previewFile', (req, res) => {
    const { name } = req.query;

    res.sendFile(getCurrentPath(name));
})

app.set('views', path.join(__dirname, 'views'));
app.engine('hbs', hbs({
    extname: '.hbs',
    defaultLayout: 'main.hbs',
    helpers: {
        getFileIcon: (fileName) => {
            const type = mime.lookup(fileName);
            if (type === 'text/css') {
                return 'css';
            }
            if (type === 'image/gif') {
                return 'gif';
            }
            if (type === 'text/html') {
                return 'html';
            }
            if (type === 'image/x-icon') {
                return 'ico';
            }
            if (type === 'image/jpeg') {
                return 'jpg';
            }
            if (type === 'application/javascript') {
                return 'js';
            }
            if (type === 'audio/mpeg') {
                return 'mp3';
            }
            if (type === 'video/mp4') {
                return 'mp4';
            }
            if (type === 'image/png') {
                return 'png';
            }
            if (type === 'text/plain') {
                return 'txt';
            }

            return 'unknown';
        },
        truncate: (elementName) => {
            const { base, ext, name } = path.parse(elementName);

            if (base.length > MAX_FILENAME_LENGTH) {
                return `${name.slice(0, MAX_FILENAME_LENGTH - ext.length)}...${ext}`;
            }

            return elementName;
        },
    },
    partialsDir: 'views/partials',
}));
app.set('view engine', 'hbs');

app.listen(PORT, () => {
    console.log(`server started at port ${PORT}`);
})
