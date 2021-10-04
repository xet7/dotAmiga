/**
    $Id: wikipedia-provider.js, 1.0 2021/10/02 12:51:00, betajaen Exp $

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

const wiki = require('wikijs').default();
const _ = require('lodash');
const express = require('express');
const { isUndefined } = require('lodash');
const router = express.Router();
const url = require('url');
const sanitizeHtml = require('sanitize-html');
const e = require('express');

const SANITIZE_SUMMARY_OPTIONS = {
    allowedTags: ['p', 'a', 'ul', 'li', 'ol', 'br'],
    allowedAttributes: {
        'a': ['href', 'title']
    },
};

const SANITIZE_PAGE_OPTIONS = {
    allowedTags: ['p', 'a', 'ul', 'li', 'ol', 'h2', 'h3', 'h4', 'h5'],
    allowedAttributes: {
        'a': ['href', 'title']
    },
};


function isWikipediaHost(res) {
    return res.locals.url.hostname == 'en.wikipedia.org';
}

router.get('/', function (req, res, next) {

    if (isWikipediaHost(res) == false) {
        next();
        return;
    }

    res.redirect('/wiki/Main_Page');
});

router.get('/w/index.php', async function (req, res, next) {

    if (isWikipediaHost(res) == false) {
        next();
        return;
    }

    if (isUndefined(req.query.search)) {
        res.redirect('/wiki/Main_Page');
        return;
    }

    const query = req.query.search;

    try {
        const searchResults = await wiki.search(query);
        let results = [];

        for (let ii = 0; ii < searchResults.results.length; ii++) {
            const searchResult = searchResults.results[ii];

            results.push({
                url: '/wiki/' + encodeURI(searchResult),
                title: searchResult
            });
        }

        res.render('wikipedia/search.mustache', {
            query: query,
            results: results,
            suggestion: {
                url: '/wiki/' + encodeURI(searchResults.suggestion),
                title: searchResults.suggestion
            }
        });
    }
    catch (err) {
        console.log(err)
        res.render('wikipedia/error.mustache', { error: err });
        return;
    }

});

router.get('/wiki/Main_Page', function (req, res, next) {

    if (isWikipediaHost(res) == false) {
        next();
        return;
    }

    res.render('wikipedia/main.mustache');
});

router.get('/wiki/:pageId', async function (req, res, next) {

    if (isWikipediaHost(res) == false) {
        next();
        return;
    }

    const viewType = req.query.view || 's';

    try {
        const wikiId = req.params.pageId;
        const wikiPage = await wiki.page(wikiId);

        let templateName = "";
        const encodedPageId = encodeURI(wikiId);

        let page = {
            id: wikiId,
            title: wikiPage.title,
            summary: "",
            url: {
                summary: '/wiki/' + encodedPageId + '?view=s',
                page: '/wiki/' + encodedPageId + '?view=p',
                images: '/wiki/' + encodedPageId + '?view=i',
            },
            section: {
                title: "",
                text: "",
                subSections: [],
                next: "",
                prev: ""
            },
            sections: []
        };

        if (viewType == 'p') {
            const sectionId = req.query.section || '';

            page.summary = await wikiPage.summary();
            const content = await wikiPage.content();

            content.forEach(function (section) {
                page.sections.push({
                    title: section.title,
                    url: '/wiki/' + encodedPageId + '?view=p&section=' + encodeURI(section.title)
                });
            });

            if (sectionId == '') {
                templateName = 'wikipedia/summary.mustache';
            }
            else {
                templateName = 'wikipedia/section.mustache';

                for (let ii = 0; ii < content.length; ii++) {
                    const contentSection = content[ii];

                    if (contentSection.title == sectionId) {

                        page.section.title = contentSection.title;
                        page.section.text = contentSection.content.replace("\n", "<br><br>\n");

                        break;
                    }
                }

            }

        }
        else {
            templateName = 'wikipedia/summary.mustache';
            page.summary = await wikiPage.summary();
            const content = await wikiPage.content();

            content.forEach(function (section) {
                page.sections.push({
                    title: section.title,
                    url: '/wiki/' + encodedPageId + '?view=p&section=' + encodeURI(section.title)
                });
            });
        }

        console.log(page);

        res.render(templateName, { page: page });
    }
    catch (err) {
        console.log(err)
        res.render('wikipedia/error.mustache', { error: err });
        return;
    }

});

module.exports = router;