import express from 'express';
import hbs from 'express-handlebars';
import formidable from 'formidable';
import path from 'path';
import fs from 'fs';

const PORT = 3000;
const __dirname = import.meta.dirname;

const app = express();
app.use(express.static('static'));

// gyatt

let savedFiles = [];

app.get('/', (req, res) => {
    res.render('upload.hbs');
})

app.get('/filemanager', (req, res) => {
    res.render('filemanager2.hbs', { savedFiles });
})

app.get('/reset', (req, res) => {
    savedFiles = [];

    res.redirect('/filemanager');
})

app.get('/show', (req, res) => {
    const { id: reqID } = req.query;
    const file = savedFiles.filter(({ id }) => id === parseInt(reqID))[0];
    
    res.sendFile(file.file.path);
})

app.get('/info', (req, res) => {
    const { id: reqID } = req.query;
    const file = savedFiles.filter(({ id }) => id === parseInt(reqID))[0];

    res.render('info.hbs', { file });
})

app.get('/download', (req, res) => {
    const { id: reqID } = req.query;
    const file = savedFiles.filter(({ id }) => id === parseInt(reqID))[0];

    res.download(file.file.path);
})

app.get('/delete', (req, res) => {
    const { id: reqID } = req.query;
    savedFiles = savedFiles.filter(({ id }) => id !== parseInt(reqID));

    res.redirect('/filemanager');
})

app.post('/', (req, res) => {
    let form = formidable({});
    form.uploadDir = __dirname + '/static/upload/';
    form.keepExtensions = true;
    form.multiples = true;
    form.parse(req, (err, _, {files}) => {
        if (Array.isArray(files)) {
            files.forEach((file) => {
                savedFiles.push({
                    file,
                    id: (savedFiles[savedFiles.length - 1]?.id ?? 0) + 1,
                    saveDate: Date.now(),
                })
            })
        } else {
            savedFiles.push({
                file: files,
                id: (savedFiles[savedFiles.length - 1]?.id ?? 0) + 1,
                saveDate: Date.now(),
            })
        }

        res.redirect('/filemanager');
    })
})

app.set('views', path.join(__dirname, 'views'));
app.engine('hbs', hbs({
    extname: '.hbs',
    defaultLayout: 'main.hbs',
    helpers: {
        getFileIcon: (type) => {
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
        }
    },
    partialsDir: 'views/partials',
}));
app.set('view engine', 'hbs');

app.listen(PORT, () => {
    console.log(`server started at port ${PORT}`);
})
