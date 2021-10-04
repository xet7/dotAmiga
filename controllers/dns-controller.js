/**
    $Id: dns-controller.js, 1.0 2021/10/02 07:16:00, betajaen Exp $

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

const dns = require('native-node-dns');
const ip = require('ip').address();
const cfg = require('../config/dns.json');

class DnsCacheItem {
    constructor(name, type, answer) {
        this.name = name;
        this.type = type;
        this.answer = answer;
    }
}

class DnsQuestionRequest {

    constructor(question, ns, controller) {
        this.question = question;
        this.ns = ns;
        this.controller = controller;
        this.log = controller.log;
    }

    resolve(callback) {

        const question = this.question;
        const self = this;

        let dnsReq = dns.Request({
            question: question,
            server: { address: this.ns, port: 53 },
            timeout: 1000
        });

        dnsReq.on('message', function (err, answer) {

            if (err) {
                self.log.error(err.toString());
                callback(null, true);
                return;
            }

            answer.answer.forEach(function (ans) {
                self.log.info(`Resolved ${question.name} to ${ans.address} from Name Server`);
                self.controller.addCache(question.name, question.type, ans);
                callback(ans, false);
            });

            callback(null, true);
        });

        this.log.info(`Requesting ${question.name} from ${dnsReq.server.address}:${dnsReq.server.port}`);

        dnsReq.send();

    }
}

class DnsResponseObject {

    constructor(req, res, controller) {

        this.res = res;
        this.question = req.question;
        this.notResolved = this.question.length;
        this.controller = controller;
        this.log = controller.log;
    }

    resolve() {

        console.log(`Resolving ${this.question.length} questions.`);

        for (let ii = 0; ii < this.question.length; ii++) {
            const question = this.question[ii];

            console.log(`Resolving ${question.name}`);

            let resolved = false;

            // Check for tld
            if (question.type == dns.consts.NAME_TO_QTYPE.A) {

                for (let jj = 0; jj < cfg.tld.length; jj++) {

                    const tld = cfg.tld[jj];

                    if (question.name.endsWith(tld)) {
                        console.log(`Resolved ${question.name} to ${ip} from custom TLD.`);

                        this.onDnsComplete(dns.A({
                            name: question.name,
                            address: ip.toString(),
                            ttl: 600,
                        }), true);

                        resolved = true;

                        break;
                    }
                }
            }

            let cacheAnswer = this.controller.findCached(question);

            if (cacheAnswer != null) {
                resolved = true;
                this.log.info(`Resolved ${question.name} to ${cacheAnswer.address} from Cache.`);
                this.onDnsComplete(cacheAnswer, true);
            }

            if (resolved == false) {
                let dnsQuestionObject = new DnsQuestionRequest(question, cfg.ns, this.controller);
                dnsQuestionObject.resolve(this.onDnsComplete.bind(this));
            }

        }
    }

    onDnsComplete(answer, isResolved) {

        if (answer != null) {
            this.res.answer.push(answer);
        }

        if (isResolved) {
            this.notResolved--;
        }

        if (this.notResolved <= 0) {
            this.log.info(`Resolved ${this.question.length} DNS questions.`);
            this.res.send();
        }

    }

}

class DnsController {

    constructor(log) {
        this.log = log;
        this.cache = [];
    }

    start() {
        this.server = dns.createServer();
        this.server.on('error', this.onError.bind(this));
        this.server.on('socketError', this.onSocketError.bind(this));
        this.server.on('request', this.onRequest.bind(this));

        this.log.info(`Starting DNS Server on port ${cfg.port}`);
        this.server.serve(cfg.port);
    }

    onError(err, buff, req, res) {
        this.log.error(err.stack);
    }

    onSocketError(err, socket) {
        this.log.error(err);
    }

    onRequest(req, res) {
        let responseObject = new DnsResponseObject(req, res, this);
        responseObject.resolve();
    }
    
    findCached(question) {
        for (let ii = 0; ii < this.cache.length; ii++) {
            const cache = this.cache[ii];

            if (cache.name == question.name && cache.type == question.type) {
                return cache.answer;
            }
        }

        return null;
    }

    addCache(name, type, answer) {
        this.cache.push(new DnsCacheItem(name, type, answer));
    }

}

module.exports = DnsController;