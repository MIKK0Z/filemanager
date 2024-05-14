import express from 'express';
import hbs from 'express-handlebars';
import formidable from 'formidable';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from "fs";
import mime from 'mime-types';

const PORT = 3000;
const MAX_FILENAME_LENGTH = 32;
const __dirname = import.meta.dirname;
const uploadPath = path.join(__dirname, 'upload');

const app = express();
app.use(express.static('static'));
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
                link: `${currentDir}${currentDir === '/' ? '' : '/'}${name}`
            };
        });
        const files = await getFiles(currentDir);
        
        res.render('filemanager.hbs', { dirs, files, subDirs, currentDir, isHome: !(currentDir !== '/' && currentDir !== '') });
    } catch (_err) {
        res.render('error.hbs', { message: `No such dir: ${currentDir}` });
    }
})

// app.get('/show', (req, res) => {
//     const { id: reqID } = req.query;
//     const file = savedFiles.filter(({ id }) => id === parseInt(reqID))[0];

//     res.sendFile(file.file.path);
// })


// app.get('/download', (req, res) => {
//     const { id: reqID } = req.query;
//     const file = savedFiles.filter(({ id }) => id === parseInt(reqID))[0];

//     res.download(file.file.path);
// })


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
    const { body: { fileName, currentDir } } = req;

    if (checkInvalidCharacter(fileName)) {
        res.render('error.hbs', { message: 'Invalid characters in file name' });
        return;
    }

    try {
        const newFileName = await getNewFileName(fileName, currentDir);

        const currentPath = getCurrentPath(currentDir);
        const newFilePath = path.join(currentPath, newFileName);

        await fs.writeFile(newFilePath, '');
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
                    const fileName = await getNewFileName(file.name);
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
    const { body: { dirName } } = req;
    const toDelteDirPath = path.join(uploadPath, dirName);

    await fs.rm(toDelteDirPath, { recursive: true });

    res.redirect('/filemanager');
})

app.post('/removeFile', async (req, res) => {
    const { body: { fileName } } = req;
    const toDelteFilePath = path.join(uploadPath, fileName);

    await fs.rm(toDelteFilePath);

    res.redirect('/filemanager');
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

            return elementName
        },
    },
    partialsDir: 'views/partials',
}));
app.set('view engine', 'hbs');

app.listen(PORT, () => {
    console.log(`server started at port ${PORT}`);
})
