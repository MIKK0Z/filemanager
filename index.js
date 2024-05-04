import express from 'express';
import hbs from 'express-handlebars';
import formidable from 'formidable';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
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

if (!fsSync.existsSync(uploadPath)) {
    await fs.mkdir(uploadPath);
}

const asyncFilter = async (arr, predicate) => {
    const results = await Promise.all(arr.map(predicate));

    return arr.filter((_v, index) => results[index]);
}

const getUploadDirContent = async () => {
    return await fs.readdir(uploadPath);
}

const getDirs = async () => {
    const uploadDirContent = await getUploadDirContent();

    const dirs = await asyncFilter(uploadDirContent, async (element) => {
        const elementPath = path.join(uploadPath, element);
        const stats = await fs.lstat(elementPath);
        return stats.isDirectory();
    })

    return dirs;
}

const getFiles = async () => {
    const uploadDirContent = await getUploadDirContent();

    const files = await asyncFilter(uploadDirContent, async (element) => {
        const elementPath = path.join(uploadPath, element);
        const stats = await fs.lstat(elementPath);
        return stats.isFile();
    })

    return files;
}

const getNewFileName = async (originalFileName) => {
    let { name: tmpFileName, ext } = path.parse(originalFileName);
    const existingFiles = await getFiles();

    while (existingFiles.includes(`${tmpFileName}${ext}`)) {
        tmpFileName = `${tmpFileName}_copy_${Date.now()}`;
    }

    return `${tmpFileName}${ext}`;
}

app.get('/', (req, res) => {
    res.redirect('/filemanager');
})

app.get('/filemanager', async (req, res) => {
    const dirs = await getDirs();
    const files = await getFiles();
    res.render('filemanager.hbs', { dirs, files });
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
    const { body: { dirName } } = req;
    let tmpDirName = dirName;

    const existingDirs = await getDirs();

    while (existingDirs.includes(tmpDirName)) {
        tmpDirName = `${dirName}_copy_${Date.now()}`;
    }

    const newDirPath = path.join(uploadPath, tmpDirName);
    await fs.mkdir(newDirPath);

    res.redirect('/filemanager');
})

app.post('/newFile', async (req, res) => {
    const { body: { fileName } } = req;
    const newFileName = await getNewFileName(fileName);

    const newFilePath = path.join(uploadPath, newFileName);
    await fs.writeFile(newFilePath, '');

    res.redirect('/filemanager');
})

app.post('/upload', (req, res) => {
    let form = formidable({});
    form.uploadDir = uploadPath;
    form.keepExtensions = true;
    form.multiples = true;
    form.parse(req, (_err, _fields, { files: uploadContent }) => {
        const uploadedFiles = Array.isArray(uploadContent) ? [...uploadContent] : [uploadContent];

        uploadedFiles.forEach(async (file) => {
            const fileName = await getNewFileName(file.name);
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
        stringifyName: (name) => {
            return name.replace('dot', 'dotdot').replace('.', 'dot');
        },
        truncate: (elementName) =>{
            const { base, ext, name } = path.parse(elementName);

            if (base.length > MAX_FILENAME_LENGTH) {
                return `${name.slice(0, MAX_FILENAME_LENGTH - ext.length)}...${ext}`;
            }

            return elementName
        }
    },
    partialsDir: 'views/partials',
}));
app.set('view engine', 'hbs');

app.listen(PORT, () => {
    console.log(`server started at port ${PORT}`);
})
