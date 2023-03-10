// ==UserScript==
// @name         Discord PNG Metadata
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Add little badge to embedded images that shows image metadata on hover.
// @author       RatWithACompiler
// @match        https://discord.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=discord.com
// @grant        GM_xmlhttpRequest
// ==/UserScript==


/*
Copyright 2023 RatWithACompiler

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

const ENABLE_NO_METADATA_BADGE = 1; // 0=OFF  1=ON   if on shows a little red "N" badge on images that don't have any metadata

/*
*
*
*
*
*
*
*
*
*
*
* */


const STYLE_NAME = "image_prompt_styleee";

function flatten_children(el_or_els, nodename = undefined, target = null) {
    // console.log("flatten_children", el_or_els);
    if (!Array.isArray(el_or_els))
        el_or_els = [el_or_els];

    if (target === null)
        target = [];

    for (const el of el_or_els) {
        if (el.children !== undefined) {  //&& typeof el.children === HTMLCollection
            flatten_children(Array.from(el.children), nodename, target);
        }

        if (nodename !== undefined && el.nodeName !== nodename) {
            // console.log("ignoring different type el", el, nodename);
            continue;
        }
        target.push(el);
    }
    return target;
}

function dom_images_check() {
    // check all current DOM images
    const images = document.getElementsByTagName("img");

    for (const imgel of images) {
        image_check(imgel);
    }
}

function mutation_observer_init() {
    // monitor DOM for additions of new img tags and process when added
    const body = document.body;
    const callback = function (mutationsList, observer) {
        // console.log("mutationsList", mutationsList);
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                const nodes = Array.from(mutation.addedNodes);
                // const nodes = Array.from(mutation.target.children);
                if (nodes.length) {
                    const children = flatten_children(nodes, "IMG");
                    // console.log("children", children.length)
                    for (const img_el of children) {
                        image_check(img_el);
                    }
                }
            }
        }
    }
    const config = {
        // characterData: true,
        attributes: false,
        childList: true,
        subtree: true
    };

    const observer = new MutationObserver(callback);
    observer.observe(body, config);

    return observer;
}

function image_check(imgel) {
    // process img element if it looks like it could contain metadata
    if (image_is_relevant(imgel)) {
        image_process_once(imgel);
        return true;
    }
    return false;
}

function image_is_relevant(imgel) {
    // any discord embed/attachment png files might contain metadata

    // TODI: could just check for only png in case of 3rd party urls too? should be fine
    // if (!imgel.currentSrc || imgel.currentSrc.indexOf(".png") === -1)
    //     return false;

    if (imgel.parentElement && !(imgel.parentElement.className || "").startsWith("clickableWrapper")) {
        // focused image view after image was clicked, don't want to show popup on that really
        // console.log("nope")
        return false;
    }

    if (imgel.currentSrc
        && imgel.currentSrc.startsWith("https://media.discordapp.net/attachments")
        && imgel.currentSrc.toLowerCase().indexOf(".png") >= 0
    )
        return true;


    return false;
}

function image_process_once(imgel) {
    // ensure  each img is only processed once.
    // (once per url, again if url changed in case element is reused)
    if (!imgel.src) {
        // console.log("no src", imgel);
        return;
    }
    if (imgel.processed_src && imgel.processed_src === imgel.src) {
        // console.log("already processed with same url", imgel);
        return;
    }
    imgel.processed_src = imgel.src;
    image_process(imgel);
}

function http_range_beginning_request(url, bytes = 4096) {
    const headers = {
        "Range": "bytes=0-" + (bytes - 1),
    };

    // console.log("fetching", url, headers);
    return new Promise((resolve, reject) => {
        const cancel = () => reject();
        GM.xmlHttpRequest({
            headers: headers,
            responseType: "blob",
            method: "GET",
            url: url,
            onload: function (response) {
                resolve(response);
            },
            onabort: cancel,
            onerror: cancel,
            ontimeout: cancel,
        });
    })

}

function insert_style() {
    const css = `
        .copy_button{
            background-color: white;
            border: 2px solid black;
            border-radius: 20px;
            cursor: pointer;
            z-index: 600000;
            text-align:center;
            width:80px;
            margin-top: 4px;
        }   
             
        .info_badge, .info_missing_badge, .info_error_badge {
            position: absolute;
            background-color: white;
            padding: 6px;
            border: 2px solid black;
            border-radius: 20px;
            opacity: 0.5;
            cursor: pointer;
            z-index: 10000;
            width: 20px;
            text-align:center;
            
        }
        .info_missing_badge{
            background-color: #dcca35;
            opacity: 0.4;
        }
        
        .info_error_badge{
            background-color: red;
            opacity: 0.6;
        }
        
        .pure_css_popup_outer{
            display:none;

            left: 20px;
            position: fixed;
            z-index: 20000;

            background-color: white;
            padding: 7px;
            border-radius: 5px;
            // border: 2px solid black;
        }
        
        .pure_css_popup_content{
            z-index: 20000;
            
            padding: 2px;
            margin: 2px;
            display: flex;
            flex-direction: column;
            max-height:270px;
            max-width:700px;
            line-height:normal;
            overflow-y:auto;
        }

        .info_badge:hover~.pure_css_popup_outer, .pure_css_popup_outer:hover{
             display: block;
        }
        
        div[class*="embedMedia-"]{
            /*workaround to make fixed div worked normally in embeds with multiple images 
            since those set contain:paint which puts position: fixed relative to its parent instead 
            of the viewport as expected. Not great but yeah. */
            contain: none !important;
        }
        
    `;
    const head = document.head || document.getElementsByTagName('head')[0];
    const style = document.createElement('style');

    head.appendChild(style);
    style.type = 'text/css';
    style.id = STYLE_NAME;
    style.appendChild(document.createTextNode(css));
}

function is_string(maybe_string) {
    return typeof maybe_string === 'string' || maybe_string instanceof String;
}

function metainfo_strings(metainfo) {
    const keyvals = [];
    const vals = [];
    for (const [key, val] of Object.entries(metainfo)) {
        if (is_string(key) && is_string(val)) {
            keyvals.push(key + ":");
            keyvals.push(val);
            vals.push(val);
        }
    }

    if (!keyvals.length) {
        return;
    }
    const metastr = keyvals.join("\n");
    const valuesstr = vals.join("\n");
    return [metastr, valuesstr];
}

function create_metadata_overlay_pure_css(imgel, metainfo) {
    // Create popup with just pure css right next to or in a close parent of the actual image,
    // feels cleaner but pretty annoying  cause it easily breaks whenever they change
    // any of the layout of the main message view.
    // Also annoying cause the surrounding layout of where images are can be very different
    // in sections like forums or with embeds and others, so all of those would need slightly
    // different insert code (mainly as to which parent and where to insert into specifically),
    // can't just do simply because in a lot of places you can't go outside of the bounds
    // of the closer parents even with position absolute and z-index cause of the css above.
    const [metastr, valuesstr] = metainfo_strings(metainfo)
    const copy_to_cb = () => {
        console.log("copying to cb");
        navigator.clipboard.writeText(valuesstr);
    };

    const info_div = document.createElement("div");
    info_div.innerText = " P ";
    info_div.className = "info_badge";

    const popup_outer = document.createElement("div");
    popup_outer.className = "pure_css_popup_outer";
    popup_outer.onclick = (e) => e.stopPropagation();

    const popup_content = document.createElement("div");
    popup_content.className = "pure_css_popup_content";
    popup_content.innerText = metastr;

    const copy_label = document.createElement("div");
    copy_label.innerText = " Copy ";
    copy_label.className = "copy_button";
    popup_outer.appendChild(popup_content);
    // popup_content.appendChild(copy_label);
    popup_outer.appendChild(copy_label);

    imgel.parentElement.parentElement.parentElement.prepend(popup_outer);
    imgel.parentElement.parentElement.parentElement.prepend(info_div);


    info_div.onclick = (e) => copy_to_cb();
    copy_label.onclick = (e) => copy_to_cb();
}

function create_metadata_overlay_js_pos_fix(imgel, metainfo) {
    //
    const [metastr, valuesstr] = metainfo_strings(metainfo)
    const copy_to_cb = () => {
        console.log("copying to cb");
        navigator.clipboard.writeText(valuesstr);
    };

    const info_div = document.createElement("div");
    info_div.innerText = " P ";
    info_div.className = "info_badge";

    const popup_outer = document.createElement("div");
    popup_outer.className = "pure_css_popup_outer";
    popup_outer.onclick = (e) => e.stopPropagation();

    const popup_content = document.createElement("div");
    popup_content.className = "pure_css_popup_content";
    popup_content.innerText = metastr;

    const copy_label = document.createElement("div");
    copy_label.innerText = " Copy ";
    copy_label.className = "copy_button";
    popup_outer.appendChild(popup_content);
    // popup_content.appendChild(copy_label);
    popup_outer.appendChild(copy_label);

    imgel.parentElement.prepend(popup_outer);
    imgel.parentElement.prepend(info_div);

    // const rect = info_div.getBoundingClientRect();
    // popup_outer.style.top = (rect.top + 14) + "px";
    // popup_outer.style.left = (rect.left + 14) + "px";

    info_div.onmouseover = function (ev) {
        const rect = ev.target.getBoundingClientRect();
        console.log("mouseover  ", rect.top, rect);
        // console.log("mouseover", ev, rect.top)
        const offset_x = 14;
        const offset_y = 14;

        const target_x = rect.left + offset_x
        popup_outer.style.left = target_x + "px";

        const target_y = rect.top + offset_y
        popup_outer.style.top = target_y + "px";

        // Fix for when position: fixed is not relative to viewport
        // but to a parent, happens when using css contain:paint like discord does
        // or when using perspective/transform/filter and probably some other things.
        // Shouldn't be needed since currently disabling contains: paint for embeds
        // as a workaround.
        //
        // const popup_rect = popup_outer.getBoundingClientRect();
        // const rect_ev = ev.target.getBoundingClientRect();
        // const diff = (rect_ev.top + offset_y) - popup_rect.top;
        // console.log("rect_ev    ", rect.top, rect);
        // console.log("popup_rect", popup_rect.top, rect);
        // console.log("diff      ", diff);
        // if (Math.abs(diff) >= 5) {
        //     popup_outer.style.top = (target_y + diff) + "px";
        //     console.log("fix     ", (target_y + diff));
        // }
        // popup_outer.style.left = (rect.left + 14) + "px";
    }


    info_div.onclick = (e) => copy_to_cb();
    copy_label.onclick = (e) => copy_to_cb();
}


function insert_popup(type, id = "metadata_popup", prepend = false) {
    const existing = document.getElementById(id);
    if (existing)
        existing.remove();

    const body = document.body || document.getElementsByTagName("body")[0];
    const div = document.createElement(type);
    div.type = "text/html";
    div.id = id;
    if (prepend)
        body.prepend(div);
    else
        body.appendChild(div);

    return div;
}


function create_metadata_missing_overlay(imgel) {
    const info_div = document.createElement("div");
    info_div.innerText = " N ";
    info_div.className = "info_missing_badge";
    imgel.parentElement.parentElement.parentElement.prepend(info_div);
}

function create_metadata_error_overlay(imgel) {
    const info_div = document.createElement("div");
    info_div.innerText = " ER ";
    info_div.className = "info_error_badge";
    imgel.parentElement.parentElement.parentElement.prepend(info_div);
}

async function image_process(imgel) {
    // range request to get first N bytes of image.
    // extract png info if present.
    // add png info div to parent on top of img element
    // console.log("image_process", imgel);

    let url = imgel.src;
    if (url.indexOf("?") !== -1) {
        url = url.slice(0, url.indexOf("?"));
    }

    // get first 8KB of PNG data into an unsigned buffer.
    // in case of error try again with 60KB because some people have a *dumb* amount
    // of negative prompts in them, like I've seen ones with 13kb ...
    const buffer_size_1 = 1024 * 8;
    const buffer_size_2 = 1024 * 60;

    const resp = await http_range_beginning_request(url, buffer_size_1);
    const signedbuffer = await resp.response.arrayBuffer();
    const buffer = new Uint8Array(signedbuffer);

    let metadata;
    try {
        metadata = png_metadata_exports.readMetadata(buffer);
    } catch (e) {
        console.log("readMetadata error 1, trying again with bigger buffer size", e, buffer_size_2, url);
        const resp = await http_range_beginning_request(url, buffer_size_2);
        const signedbuffer = await resp.response.arrayBuffer();
        const buffer = new Uint8Array(signedbuffer);

        try {
            metadata = png_metadata_exports.readMetadata(buffer);
            console.log("bigger buffer size was ok", buffer_size_2, url)
        } catch (e) {
            console.log("readMetadata error 2, trying again with null ignore", e, url);
            try {
                metadata = png_metadata_exports.readMetadata(buffer, true);
            } catch (e) {
                console.log("readMetadata error 3", e, url);
                create_metadata_error_overlay(imgel);
                return
            }


        }
    }

    if (metadata && metadata.tEXt) {
        // console.log(metadata.tEXt);
        // create_metadata_overlay_pure_css(imgel, metadata.tEXt);
        create_metadata_overlay_js_pos_fix(imgel, metadata.tEXt);
    } else if (ENABLE_NO_METADATA_BADGE) {
        create_metadata_missing_overlay(imgel);
    }
}

function png_metadata() {

    /*
    The MIT License (MIT) Copyright (c) 2015 Hugh Kennedy
    Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
    The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
    */

    function textDecode(data, ignore_null_errors) {
        if (data.data && data.name) {
            data = data.data
        }

        let naming = true
        let text = ''
        let name = ''

        for (let i = 0; i < data.length; i++) {
            let code = data[i]

            if (naming) {
                if (code) {
                    name += String.fromCharCode(code)
                } else {
                    naming = false
                }
            } else {
                if (code) {
                    text += String.fromCharCode(code)
                } else {
                    if (!ignore_null_errors)
                        throw new Error('Invalid NULL character found. 0x00 character is not permitted in tEXt content')
                }
            }
        }

        return {
            keyword: name,
            text: text
        }
    }


    function extractChunks(data) {
        if (data[0] !== 0x89) throw new Error('Invalid .png file header')
        if (data[1] !== 0x50) throw new Error('Invalid .png file header')
        if (data[2] !== 0x4E) throw new Error('Invalid .png file header')
        if (data[3] !== 0x47) throw new Error('Invalid .png file header')
        if (data[4] !== 0x0D) throw new Error('Invalid .png file header: possibly caused by DOS-Unix line ending conversion?')
        if (data[5] !== 0x0A) throw new Error('Invalid .png file header: possibly caused by DOS-Unix line ending conversion?')
        if (data[6] !== 0x1A) throw new Error('Invalid .png file header')
        if (data[7] !== 0x0A) throw new Error('Invalid .png file header: possibly caused by DOS-Unix line ending conversion?')

        let ended = false
        let chunks = []
        let idx = 8

        // Used for fast-ish conversion between uint8s and uint32s/int32s.
        // Also required in order to remain agnostic for both Node Buffers and
        // Uint8Arrays.
        let uint8 = new Uint8Array(4);
        let int32 = new Int32Array(uint8.buffer);
        let uint32 = new Uint32Array(uint8.buffer);

        try {

            while (idx < data.length) {
                // Read the length of the current chunk,
                // which is stored as a Uint32.
                uint8[3] = data[idx++]
                uint8[2] = data[idx++]
                uint8[1] = data[idx++]
                uint8[0] = data[idx++]

                // Chunk includes name/type for CRC check (see below).
                let length = uint32[0] + 4
                let chunk = new Uint8Array(length)
                chunk[0] = data[idx++]
                chunk[1] = data[idx++]
                chunk[2] = data[idx++]
                chunk[3] = data[idx++]

                // Get the name in ASCII for identification.
                let name = (
                    String.fromCharCode(chunk[0]) +
                    String.fromCharCode(chunk[1]) +
                    String.fromCharCode(chunk[2]) +
                    String.fromCharCode(chunk[3])
                )

                // The IHDR header MUST come first.
                if (!chunks.length && name !== 'IHDR') {
                    throw new Error('IHDR header missing')
                }

                // The IEND header marks the end of the file,
                // so on discovering it break out of the loop.
                if (name === 'IEND') {
                    ended = true
                    chunks.push({
                        name: name,
                        data: new Uint8Array(0)
                    })

                    break
                }

                // Read the contents of the chunk out of the main buffer.
                for (let i = 4; i < length; i++) {
                    chunk[i] = data[idx++]
                }

                idx += 4; //crc
                let chunkData = new Uint8Array(chunk.buffer.slice(4))

                chunks.push({
                    name: name,
                    data: chunkData
                })
            }
        } catch (e) {
            console.log("png parsing error", e, chunks.length);
        }
        return chunks
    }


    function readMetadata(buffer, ignore_null_errors) {
        let result = {};
        const chunks = extractChunks(buffer);
        chunks.forEach(chunk => {
            switch (chunk.name) {
                case 'tEXt':
                    if (!result.tEXt) {
                        result.tEXt = {};
                    }
                    let textChunk = textDecode(chunk.data, ignore_null_errors);
                    result.tEXt[textChunk.keyword] = textChunk.text;
                    break
                default:
                    result[chunk.name] = true;
            }
        })
        return result;
    }

    exports = {
        readMetadata: readMetadata,
    };

    return exports;
}


function stop(state) {
    if (state.observer) {
        console.log("disconnecting observer");
        state.observer.disconnect();
        state.observer = undefined;
    } else {
        console.log("no observer");
    }

    const style = document.getElementById(STYLE_NAME);
    if (style) {
        console.log("removing style head", STYLE_NAME);
        style.remove();
    }
}

function main() {
    console.log("discord png meta main", "asdf");
    let state;
    try {
        if (DevState !== undefined)
            state = DevState;
    } catch {
    }

    if (state === undefined)
        state = window.state || {run: 0};

    state.run++;
    stop(state);

    state.observer = mutation_observer_init();
    insert_style();
    dom_images_check();
}

const png_metadata_exports = png_metadata();
main();