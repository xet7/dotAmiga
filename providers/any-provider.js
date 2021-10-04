/**
    $Id: any-provider.js, 1.0 2021/10/02 12:51:00, betajaen Exp $

    dotAmiga

    Copyright 2021 Robin Southern https://github.com/betajaen/dotAmiga

    Permission is hereby granted, free of charge, to any person obtaining a
    copy of this software and associated documentation files (the "Software"),
    to deal in the Software without restriction, including without limitation
    the rights to use, copy, modify, merge, publish, distribute, sublicense,
    and/or sell copies of the Software, and to permit persons to whom the
    Software is furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included
    in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
    THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
    FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
    DEALINGS IN THE SOFTWARE.
*/

const express = require('express');
const router = express.Router();
const axios = require('axios');
const cfg = require('../config/web.json');
const _ = require('lodash');
const sanitizeHtml = require('sanitize-html');
const fs = require('fs');
const sharp = require('sharp');
const crypto = require('crypto');
const JSONdb = require('simple-json-db');
const cheerio = require('cheerio');

const IMAGE_CONTENT_TYPES = [
    'image/gif',
    'image/png',
    'image/jpeg'
];

const GIF_1X1 = fs.readFileSync(__dirname + '/../static/gif_1x1.gif');

const WEB32 = {
    allowedTags: [
        "html", "body", "head", "title",
        "h1", "h2", "h3", "h4", "h5", "h6",
        "p", "br", "hr",
        "b", "strong", "i", "em",
        "a",
        "img",
        "table", "tr", "td",
        "form", "field", "input", "select", "option"
    ],
    disallowedTagsMode: 'discard',
    allowedAttributes: {
        a: ['href'],
        img: ['src']
    },
    allowedSchemesByTag: {},
    allowProtocolRelative: true,
    enforceHtmlBoundary: true
}

async function processHtml(data) {

    let $ = cheerio.load(sanitizeHtml(data, WEB32));

    // Transform links to .amiga tld.
    let as = $("a");

    for (let ii = 0; ii < as.length; ii++) {

        let a = as[ii];
        let href = a.attribs.href || '';

        if (_.startsWith(href, "http:") || _.startsWith(href, "https:")) {
            const url = new URL(href);
            url.hostname = url.hostname + cfg.tld;
            url.protocol = "http:";

            a.attribs.href = url.toString();
        }
    };

    // Transform imgs to .image.amiga tld
    let imgs = $("img");

    for (let ii = 0; ii < imgs.length; ii++) {

        let img = imgs[ii];

        let imgUrl = img.attribs.src;

        if (_.startsWith(imgUrl, "data:")) {
            imgUrl = await processDataImage(imgUrl);
        }
        else if (_.startsWith(imgUrl, "http:") || _.startsWith(imgUrl, "https:")) {
            imgUrl = await processPrefetchImage(imgUrl);
        }

        img.attribs.src = imgUrl.toString();
    }

    let html = $.root().html();

    return html;
}

const imageDb = new JSONdb(__dirname + `/../cache/images/images.db`);

function fetchImage(name) {

    if (imageDb.has(name)) {

        const imagePath = __dirname + `/../cache/images/${name}.img`;

        const meta = imageDb.get(name);

        return {
            contentType: meta.c,
            data: fs.readFileSync(imagePath, 'binary')
        };
    }

    return null;
}

async function processImage(name, data, contentType) {

    const imagePath = __dirname + `/../cache/images/${name}.img`;

    const meta = {
        c: "image/png",
        t: Date.now(),
        d: ""
    }

    imageDb.set(name, meta);

    let img = sharp(data)
        .resize(320, 240, {
            fit: sharp.fit.inside,
            withoutEnlargement: true
        })
        .toFormat('png', { palette: true, colours: 32 });

    await img.toFile(imagePath);

    return (await img.toBuffer()).data;
}

async function processDataImage(data) {

    let hash = crypto.createHash('sha256');
    hash.update(data);
    const name = hash.digest('hex');

    const imageDataStr = data.split(data.indexOf(',') + 1);
    const imageData = Buffer.from(imageDataStr, 'base64'); 

    let img = sharp(imageData)
        .resize(320, 240, {
            fit: sharp.fit.inside,
            withoutEnlargement: true
        })
        .toFormat('png', { palette: true, colours: 32 });

    await img.toFile(imagePath);

    return `http://images.internal.amiga/?i=${name}`;

}

async function processPrefetchImage(href) {

    let hash = crypto.createHash('sha256');
    hash.update(href);
    const name = hash.digest('hex');

    // Catched.
    if (imageDb.has(name)) {
        return `http://images.internal.amiga/?i=${name}`;
    }

    try {

        const response = await axios.get(href, { responseType: 'arraybuffer' });
        const contentType = response.headers['content-type'];

        if (_.indexOf(IMAGE_CONTENT_TYPES, contentType) != 0) {
            await processImage(name, response.data, contentType);
            return `http://images.internal.amiga/?i=${name}`;
        }
    }
    catch (err) {
        return href;
    }

    return href;
}


router.get('*', async function (req, res, next) {

    // prefetch
    // <hex>.images.amiga.amiga
    if (res.locals.url.hostname == "images.internal") {

        const imageId = res.locals.url.searchParams.get('i');
        const imageDataCache = fetchImage(imageId);

        res.status(200);

        if (imageDataCache != null) {
            res.set({ 'Content-Type': imageDataCache.type });
            res.write(imageDataCache.data, 'binary');
        }
        else {
            res.set({ 'Content-Type': "image/gif" });
            res.write(GIF_1X1, 'binary');
        }

        res.end();
        return;
    }

    
    try {
        const response = await axios.get(res.locals.url.toString());
        const contentType = response.headers['content-type'];

        if (_.startsWith(contentType, 'text/html')) {
            const content = await processHtml(response.data);
            res.set('Content-Type', 'text/html');
            res.send(content);
            res.end();
        }
        else {
            res.status(200);
            res.set('Content-Type', contentType);
            res.send(response.data);
            res.end();
        }

    }
    catch (err) {
        res.status(404);
        res.end();
    }
    


});


module.exports = router;