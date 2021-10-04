/**
    $Id: web-controller.js, 1.0 2021/10/02 10:43:00, betajaen Exp $

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

const cfg = require('../config/web.json');
const express = require('express');
const mustacheExpress = require('mustache-express');
const url = require('url');
const { ReqToInternalUrl, ReqToExternalUrl } = require('../helpers/url-helper.js');

let WebLog = null;

class WebController {

    constructor(log) {

        if (WebLog == null) {
            WebLog = log;
        }

        this.app = express();
        this.app.engine('mustache', mustacheExpress());
        this.app.set('view engine', 'mustache');
        this.app.set('views', __dirname + '/../views/');

        this.app.use(function (req, res, next) {
            const lastDot = req.hostname.lastIndexOf('.');
            res.locals.url = new URL(req.protocol + '://' + req.hostname.slice(0, lastDot) + req.url);
            res.locals.originalUrl = new URL(req.protocol + '://' + req.hostname + req.url)

            next();
        });

        const providerNames = require('../config/providers.json');

        for (let ii = 0; ii < providerNames.length; ii++) {
            this.app.use(require(`../providers/${providerNames[ii]}-provider.js`));
        }

        // Fallback
        this.app.use(require(`../providers/any-provider.js`));
    }

    start() {
        this.app.listen(cfg.port, () => {
            WebLog.info(`Starting Web Server on port ${cfg.port}`);
        });
    }

    async getAny(req, res) {
        const addrInternal = ReqToInternalUrl(req);
        const addrExternal = ReqToExternalUrl(req);
        let handled = false;

        for (let ii = 0; ii < this.providers.length; ii++) {
            const provider = this.providers[ii];

            if (provider.canHandle(addrExternal)) {
                provider.handle(addrInternal, addrExternal, req, res);
                handled = true;
                break;
            }
        }

        if (handled == false) {
            res.status(501);
            res.send(`<HTML><HEAD><TITLE>Internal Server Error</TITLE><BODY><H1>Internal Server Error</H1><P>No provider could handle ${addrExternal.toString()}</P></BODY></HTML>`);
        }
    }

    async postAny(req, res) {
        WebLog.info(`POST ${req.hostname}`);
        res.send("POST *");
    }

}

module.exports = WebController;