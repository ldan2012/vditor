import {insertText} from "../editor/insertText";
import {setSelectionFocus} from "../editor/setSelection";
import {i18n} from "../i18n/index";

class Upload {
    public element: HTMLElement;
    public isUploading: boolean;
    public range: Range;

    constructor() {
        this.isUploading = false;
        this.element = document.createElement("div");
        this.element.className = "vditor-upload";
    }
}

const validateFile = (vditor: IVditor, files: File[]) => {
    vditor.tip.hide();
    const uploadFileList = [];
    let errorTip = "";
    let uploadingStr = "";
    const lang: (keyof II18nLang) = vditor.options.lang;

    for (let iMax = files.length, i = 0; i < iMax; i++) {
        const file = files[i];
        let validate = true;

        if (!file.name) {
            errorTip += `<li>${i18n[lang].nameEmpty}</li>`;
            validate = false;
        }

        if (file.size > vditor.options.upload.max) {
            errorTip += `<li>${file.name} ${i18n[lang].over} ${vditor.options.upload.max / 1024 / 1024}M</li>`;
            validate = false;
        }

        const lastIndex = file.name.lastIndexOf(".");
        const fileExt = file.name.substr(lastIndex);
        const filename = vditor.options.upload.filename(file.name.substr(0, lastIndex)) + fileExt;

        if (vditor.options.upload.accept) {
            let isAccept = false;
            vditor.options.upload.accept.split(",").forEach((item) => {
                const type = item.trim();
                if (type.indexOf(".") === 0) {
                    if (fileExt === type) {
                        isAccept = true;
                    }
                } else {
                    if (file.type.split("/")[0] === type.split("/")[0]) {
                        isAccept = true;
                    }
                }
            });

            if (!isAccept) {
                errorTip += `<li>${file.name} ${i18n[lang].fileTypeError}</li>`;
                validate = false;
            }
        }

        if (validate) {
            uploadFileList.push(file);
            uploadingStr += `<li>${filename} ${i18n[lang].uploading}</li>`;
        }
    }

    vditor.tip.show(`<ul>${errorTip}${uploadingStr}</ul>`);

    return uploadFileList;
};

const genUploadedLabel =
    (editorElement: HTMLPreElement, responseText: string, vditor: IVditor) => {
        editorElement.focus();
        const response = JSON.parse(responseText);
        let errorTip: string = ''

        if (response.code === 1) {
            errorTip = `${response.msg}`
        }

        if (response.data.errFiles && response.data.errFiles.length > 0) {
            errorTip = `<ul><li>${errorTip}</li>`
            response.data.errFiles.forEach((data: string) => {
                const lastIndex = data.lastIndexOf(".");
                const filename = vditor.options.upload.filename(data.substr(0, lastIndex)) + data.substr(lastIndex);
                errorTip += `<li>${filename} ${i18n[vditor.options.lang].uploadError}</li>`
            });
            errorTip += '</ul>'
        }

        if (errorTip) {
            vditor.tip.show(errorTip);
        } else {
            vditor.tip.hide()
        }

        Object.keys(response.data.succMap).forEach((key) => {
            const path = response.data.succMap[key];
            const lastIndex = key.lastIndexOf(".");
            let type = key.substr(lastIndex)
            const filename = vditor.options.upload.filename(key.substr(0, lastIndex)) + type;
            setSelectionFocus(vditor.upload.range)
            type = type.toLowerCase()
            let fileText = `[${filename}](${path})\n`
            if (type === ".flac" || type === ".mp4" || type === ".ogg" || type === ".mov" || type === ".webm"
                || type === ".wav") {
                fileText = `<audio controls="controls" src="${path}"></audio>\n`
            } else if (type === ".apng"
                || type === '.bmp'
                || type === '.gif'
                || type === ".ico" || type === ".cur"
                || type === '.jpg' || type === '.jpeg' || type === '.jfif' || type === '.pjp' || type === '.pjpeg'
                || type === '.png'
                || type === ".svg"
                || type === ".webp") {
                fileText = `![${filename}](${path})\n`
            }
            // TODO wysiwyg
            insertText(vditor, fileText, "", true);

            vditor.upload.range = getSelection().getRangeAt(0).cloneRange()
        });
    };

const uploadFiles = (vditor: IVditor, files: FileList | DataTransferItemList | File[], element?: HTMLInputElement) => {
    // FileList | DataTransferItemList | File[] => File[]
    const fileList = [];
    for (let iMax = files.length, i = 0; i < iMax; i++) {
        let fileItem = files[i];
        if (fileItem instanceof DataTransferItem) {
            fileItem = fileItem.getAsFile();
        }
        fileList.push(fileItem);
    }

    if (vditor.options.upload.handler) {
        const isValidate = vditor.options.upload.handler(fileList);
        if (typeof isValidate === "string") {
            vditor.tip.show(isValidate);
            return;
        }
        return;
    }

    if (!vditor.options.upload.url || !vditor.upload) {
        if (element) {
            element.value = "";
        }
        alert("please config: options.upload.url");
        return;
    }

    if (vditor.options.upload.validate) {
        const isValidate = vditor.options.upload.validate(fileList);
        if (typeof isValidate === "string") {
            vditor.tip.show(isValidate);
            return;
        }
    }

    vditor.upload.range = getSelection().getRangeAt(0)

    const validateResult = validateFile(vditor, fileList);
    if (validateResult.length === 0) {
        if (element) {
            element.value = "";
        }
        return;
    }

    const formData = new FormData();
    for (let i = 0, iMax = validateResult.length; i < iMax; i++) {
        formData.append("file[]", validateResult[i]);
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", vditor.options.upload.url);
    if (vditor.options.upload.token) {
        xhr.setRequestHeader("X-Upload-Token", vditor.options.upload.token);
    }
    if (vditor.options.upload.withCredentials) {
        xhr.withCredentials = true;
    }
    vditor.upload.isUploading = true;
    vditor.editor.element.setAttribute("contenteditable", "false");

    xhr.onreadystatechange = () => {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            vditor.upload.isUploading = false;
            if (element) {
                element.value = "";
            }
            vditor.editor.element.setAttribute("contenteditable", "true");

            if (xhr.status === 200) {
                if (vditor.options.upload.success) {
                    vditor.options.upload.success(vditor.editor.element, xhr.responseText);
                } else {
                    let responseText = xhr.responseText;
                    if (vditor.options.upload.format) {
                        responseText = vditor.options.upload.format(files as File [], xhr.responseText);
                    }
                    genUploadedLabel(vditor.editor.element, responseText, vditor);
                }
            } else {
                if (vditor.options.upload.error) {
                    vditor.options.upload.error(xhr.responseText);
                } else {
                    vditor.tip.show(xhr.responseText);
                }
            }
            vditor.upload.element.style.display = "none";
        }
    };
    xhr.upload.onprogress = (event: ProgressEvent) => {
        if (!event.lengthComputable) {
            return;
        }
        const progress = event.loaded / event.total * 100;
        vditor.upload.element.style.display = "block";
        const progressBar = vditor.upload.element;
        progressBar.style.width = progress + "%";
    };
    xhr.send(formData);
};

export {Upload, uploadFiles};
