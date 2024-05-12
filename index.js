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
    return await fs.readdir(currentPath);
}

const getCurrentPath = (currentDir) => {
    return path.join(uploadPath, ...(currentDir ?? '').split('/'));
}

const getDirs = async (currentDir) => {
    const currentPath = getCurrentPath(currentDir);
    const uploadDirContent = await getUploadDirContent(currentPath);

    const dirs = await asyncFilter(uploadDirContent, async (element) => {
        const elementPath = path.join(currentPath, element);
        const stats = await fs.lstat(elementPath);
        return stats.isDirectory();
    })

    return dirs;
}

const getFiles = async (currentDir) => {
    const currentPath = getCurrentPath(currentDir);
    const uploadDirContent = await getUploadDirContent(currentPath);

    const files = await asyncFilter(uploadDirContent, async (element) => {
        const elementPath = path.join(currentPath, element);
        const stats = await fs.lstat(elementPath);
        return stats.isFile();
    })

    return files;
}

const getNewFileName = async (originalFileName, currentDir) => {
    let { name: tmpFileName, ext } = path.parse(originalFileName);
    const existingFiles = await getFiles(currentDir);

    while (existingFiles.includes(`${tmpFileName}${ext}`)) {
        tmpFileName = `${tmpFileName}_copy_${Date.now()}`;
    }

    return `${tmpFileName}${ext}`;
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

app.get('/', (req, res) => {
    res.redirect('/filemanager');
})

app.get('/filemanager', async (req, res) => {
    const currentDir = req.query.name ?? '/';
    const subDirs = getSubDirs(currentDir);

    const dirs = (await getDirs(currentDir)).map((name, i) => {
        return {
            name,
            // link: `/${name}`,
            link: `${currentDir}${currentDir === '/' ? '' : '/'}${name}`
        };
    });
    const files = await getFiles(currentDir);

    res.render('filemanager.hbs', { dirs, files, subDirs, currentDir, isHome: currentDir === '/' });
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
    let tmpDirName = dirName;

    const existingDirs = await getDirs(currentDir);
    const currentPath = getCurrentPath(currentDir);

    while (existingDirs.includes(tmpDirName)) {
        tmpDirName = `${dirName}_copy_${Date.now()}`;
    }

    const newDirPath = path.join(currentPath, tmpDirName);
    await fs.mkdir(newDirPath);

    const urlName = newDirPath.split('upload')[1]?.split(path.sep)?.join('/') ?? '/';

    res.redirect(`/filemanager?name=${urlName}`);
})

app.post('/newFile', async (req, res) => {
    const { body: { fileName, currentDir } } = req;
    const newFileName = await getNewFileName(fileName, currentDir);

    const currentPath = getCurrentPath(currentDir);
    const newFilePath = path.join(currentPath, newFileName);
    await fs.writeFile(newFilePath, '');

    const urlName = currentPath.split('upload')[1]?.split(path.sep)?.join('/') ?? '/';

    res.redirect(`/filemanager?name=${urlName}`);
})

app.post('/upload', (req, res) => {
    console.log(req)

    let form = formidable({});
    form.uploadDir = uploadPath;
    form.keepExtensions = true;
    form.multiples = true;
    form.parse(req, (_err, _fields, { files: uploadContent }) => {
        const uploadedFiles = Array.isArray(uploadContent) ? [...uploadContent] : [uploadContent];

        uploadedFiles.forEach(async (file) => {
            const fileName = (await getNewFileName(file.name)).replaceAll(' ', '_');
            const newFilePath = path.join(uploadPath, fileName);
            await fs.rename(file.path, newFilePath);
        })

        res.redirect('/filemanager');
    })
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

    let tmpDirName = dirName;

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
            if (type === 'image/gif') {
                return 'gif';
            }
            if (type === 'image/x-icon') {
                return 'ico';
            }
            if (type === 'image/jpeg') {
                return 'jpg';
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
