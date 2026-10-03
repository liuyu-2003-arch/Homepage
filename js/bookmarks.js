import { safeUrl } from './utils.js?v=2.9.73';

const MAX_TITLE_LENGTH = 160;
const BOOKMARK_FILE_MARKER = /NETSCAPE-Bookmark-file-1/i;

function normalizeTitle(value, fallback = '') {
    const title = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    return (title || fallback).slice(0, MAX_TITLE_LENGTH);
}

function directChild(element, tagName) {
    return Array.from(element.children).find((child) => child.tagName === tagName) || null;
}

function createBookmark(anchor) {
    const url = safeUrl(anchor.getAttribute('href') || '', '');
    if (!url) return null;

    const icon = safeUrl(anchor.getAttribute('ICON') || anchor.getAttribute('icon') || '', '');
    const title = normalizeTitle(anchor.textContent, url);
    return icon ? { url, title, icon } : { url, title };
}

function parseBookmarkList(list, folderTitle = '') {
    const folder = {
        title: normalizeTitle(folderTitle),
        bookmarks: [],
        folders: []
    };
    let pendingFolder = null;

    const attachFolder = (nestedList) => {
        if (!pendingFolder) return;
        folder.folders.push(parseBookmarkList(nestedList, pendingFolder.title));
        pendingFolder = null;
    };

    for (const node of Array.from(list.children)) {
        if (node.tagName === 'P') continue;

        if (node.tagName === 'DT') {
            const heading = directChild(node, 'H3');
            const anchor = directChild(node, 'A');
            const nestedList = directChild(node, 'DL');

            if (heading) {
                pendingFolder = { title: normalizeTitle(heading.textContent) };
            } else if (anchor) {
                const bookmark = createBookmark(anchor);
                if (bookmark) folder.bookmarks.push(bookmark);
            }

            if (nestedList) attachFolder(nestedList);
            continue;
        }

        if (node.tagName === 'H3') {
            pendingFolder = { title: normalizeTitle(node.textContent) };
            continue;
        }

        if (node.tagName === 'A') {
            const bookmark = createBookmark(node);
            if (bookmark) folder.bookmarks.push(bookmark);
            continue;
        }

        if (node.tagName === 'DL') {
            if (pendingFolder) {
                attachFolder(node);
            } else {
                folder.folders.push(parseBookmarkList(node));
            }
        }
    }

    return folder;
}

function folderToPages(folder, parentPath = [], rootBookmarksTitle = 'Imported bookmarks') {
    const pages = [];
    const folderPath = folder.title ? [...parentPath, folder.title] : parentPath;

    if (folder.bookmarks.length > 0) {
        pages.push({
            title: folderPath.join(' / ') || rootBookmarksTitle,
            bookmarks: folder.bookmarks
        });
    }

    folder.folders.forEach((child) => {
        pages.push(...folderToPages(child, folderPath, rootBookmarksTitle));
    });
    return pages;
}

export function parseBrowserBookmarksHtml(html, rootBookmarksTitle = 'Imported bookmarks') {
    if (typeof html !== 'string' || !BOOKMARK_FILE_MARKER.test(html.slice(0, 2048))) {
        throw new Error('Invalid browser bookmark file');
    }

    const document = new DOMParser().parseFromString(html, 'text/html');
    const rootList = document.querySelector('dl');
    if (!rootList) throw new Error('Bookmark folders are missing');

    const rootFolder = parseBookmarkList(rootList);
    const pages = folderToPages(rootFolder, [], normalizeTitle(rootBookmarksTitle, 'Imported bookmarks'));
    if (pages.length === 0) throw new Error('No bookmarks found');
    return pages;
}

function bookmarkUrlKey(bookmark) {
    return safeUrl(bookmark?.url || '', '').toLowerCase();
}

export function mergeBookmarkPages(existingPages, importedPages) {
    const merged = Array.isArray(existingPages)
        ? existingPages.map((page) => ({ ...page, bookmarks: [...(page.bookmarks || [])] }))
        : [];

    importedPages.forEach((importedPage) => {
        const title = normalizeTitle(importedPage.title, 'Imported bookmarks');
        let targetPage = merged.find((page) => normalizeTitle(page.title).toLowerCase() === title.toLowerCase());
        if (!targetPage) {
            targetPage = { title, bookmarks: [] };
            merged.push(targetPage);
        }

        const existingUrls = new Set(targetPage.bookmarks.map(bookmarkUrlKey));
        importedPage.bookmarks.forEach((bookmark) => {
            const urlKey = bookmarkUrlKey(bookmark);
            if (!urlKey || existingUrls.has(urlKey)) return;
            targetPage.bookmarks.push({ ...bookmark, title: normalizeTitle(bookmark.title, bookmark.url) });
            existingUrls.add(urlKey);
        });
    });

    return merged;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function absoluteIconUrl(icon) {
    const safe = safeUrl(icon || '', '');
    if (!safe) return '';
    if (/^https?:\/\//i.test(safe)) return safe;
    if (typeof document === 'undefined' || !/^https?:$/.test(location.protocol)) return '';
    try {
        const url = new URL(safe, document.baseURI);
        return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch {
        return '';
    }
}

export function serializeBrowserBookmarks(pages) {
    const lines = [
        '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
        '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
        '<TITLE>My Homepage Bookmarks</TITLE>',
        '<H1>My Homepage Bookmarks</H1>',
        '<DL><p>'
    ];

    (Array.isArray(pages) ? pages : []).forEach((page) => {
        const title = normalizeTitle(page.title, 'Untitled');
        const bookmarks = (page.bookmarks || [])
            .map((bookmark) => ({ ...bookmark, url: safeUrl(bookmark.url || '', '') }))
            .filter((bookmark) => bookmark.url);
        if (bookmarks.length === 0) return;

        lines.push(`    <DT><H3>${escapeHtml(title)}</H3>`);
        lines.push('    <DL><p>');
        bookmarks.forEach((bookmark) => {
            const icon = absoluteIconUrl(bookmark.icon);
            const iconAttribute = icon ? ` ICON="${escapeHtml(icon)}"` : '';
            const bookmarkTitle = normalizeTitle(bookmark.title, bookmark.url);
            lines.push(`        <DT><A HREF="${escapeHtml(bookmark.url)}"${iconAttribute}>${escapeHtml(bookmarkTitle)}</A>`);
        });
        lines.push('    </DL><p>');
    });

    lines.push('</DL><p>', '');
    return lines.join('\n');
}
