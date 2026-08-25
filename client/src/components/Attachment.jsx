import { useEffect, useRef, useState } from 'react';
import { Download, Eye, FileImage, FileText, Paperclip, Trash2, UploadCloud } from 'lucide-react';
import { api, errMsg } from '../api';
import { useApp } from '../context/AppContextValue';

const ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';
const MAX_BYTES = 8 * 1024 * 1024;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read the selected file'));
    reader.readAsDataURL(file);
  });
}

function formatBytes(value) {
  if (!value) return '';
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchAttachment(attachment) {
  const { data } = await api.get(attachment.url || `/attachments/${attachment._id}/content`, { responseType: 'blob' });
  return URL.createObjectURL(data);
}

export function AttachmentImage({ attachment, alt = '', className = '' }) {
  const [src, setSrc] = useState('');
  const attachmentId = attachment?._id;
  const attachmentUrl = attachment?.url;
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    if (!attachmentId) {
      setSrc('');
      return undefined;
    }
    fetchAttachment({ _id: attachmentId, url: attachmentUrl }).then((url) => {
      objectUrl = url;
      if (active) setSrc(url);
    }).catch(() => { if (active) setSrc(''); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId, attachmentUrl]);
  return src ? <img src={src} alt={alt} className={className} /> : null;
}

export function AttachmentLink({ attachment, compact = false }) {
  const { notify } = useApp();
  if (!attachment?._id) return compact ? <span className="muted">—</span> : null;

  const open = async (download = false) => {
    const preview = download ? null : window.open('', '_blank');
    try {
      const objectUrl = await fetchAttachment(attachment);
      if (download) {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = attachment.fileName || 'attachment';
        anchor.click();
      } else if (preview) preview.location.href = objectUrl;
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      preview?.close();
      notify(errMsg(error), 'error');
    }
  };

  return (
    <span className={`attachment-actions ${compact ? 'compact' : ''}`}>
      <button type="button" className="attachment-action" onClick={() => open(false)} title="Preview attachment"><Eye size={13} /> {!compact && 'Preview'}</button>
      <button type="button" className="attachment-action" onClick={() => open(true)} title="Download attachment"><Download size={13} /> {!compact && 'Download'}</button>
    </span>
  );
}

export function AttachmentField({ value, onChange, scope, hostId, documentType, imageOnly = false, title }) {
  const { notify } = useApp();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const selectFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const allowedTypes = imageOnly ? ['image/png', 'image/jpeg'] : ['application/pdf', 'image/png', 'image/jpeg'];
    if (!allowedTypes.includes(file.type)) {
      notify(imageOnly ? 'Only PNG, JPG and JPEG images are allowed' : 'Only PDF, PNG, JPG and JPEG files are allowed', 'error');
      return;
    }
    if (file.size > MAX_BYTES) {
      notify('The selected file exceeds the 8 MB limit', 'error');
      return;
    }
    setUploading(true);
    try {
      const data = await readAsDataUrl(file);
      const response = await api.post('/attachments', { fileName: file.name, mimeType: file.type, data, scope, hostId, documentType });
      onChange(response.data);
      notify('Attachment uploaded');
    } catch (error) {
      notify(errMsg(error), 'error');
    } finally {
      setUploading(false);
    }
  };

  const FileIcon = value?.mimeType === 'application/pdf' ? FileText : FileImage;
  return (
    <div className="attachment-field">
      <input ref={inputRef} type="file" accept={imageOnly ? '.png,.jpg,.jpeg,image/png,image/jpeg' : ACCEPT} hidden onChange={selectFile} />
      {value?._id ? (
        <div className="attachment-file-card">
          <div className="attachment-file-icon"><FileIcon size={20} /></div>
          <div className="attachment-file-copy"><b>{value.fileName}</b><span>{value.fileType || 'File'} · {formatBytes(value.size)}{value.uploadedBy ? ` · ${value.uploadedBy}` : ''}{value.uploadedAt ? ` · ${new Date(value.uploadedAt).toLocaleDateString()}` : ''}</span></div>
          <AttachmentLink attachment={value} compact />
          <button type="button" className="attachment-remove" onClick={() => onChange(null)} title="Remove attachment"><Trash2 size={14} /></button>
        </div>
      ) : (
        <button type="button" className="attachment-dropzone" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? <span className="attachment-spinner" /> : <UploadCloud size={21} />}
          <span><b>{uploading ? 'Uploading…' : (title || (imageOnly ? 'Upload image' : 'Upload PDF or image'))}</b><small>{imageOnly ? 'PNG, JPG or JPEG' : 'PDF, PNG, JPG or JPEG'} · Maximum 8 MB</small></span>
          <Paperclip size={15} />
        </button>
      )}
    </div>
  );
}
