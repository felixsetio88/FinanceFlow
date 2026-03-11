import React, { useRef } from 'react';
import { Camera, X } from 'lucide-react';

export default function PhotoUpload({ photos, onChange }) {
    const fileRef = useRef();

    const handleAdd = (e) => {
        const files = Array.from(e.target.files);
        const newPhotos = files.map(file => ({
            id: Date.now() + Math.random(),
            url: URL.createObjectURL(file),
            file,
        }));
        onChange([...photos, ...newPhotos]);
        fileRef.current.value = '';
    };

    const handleRemove = (id) => {
        const photo = photos.find(p => p.id === id);
        if (photo?.url) URL.revokeObjectURL(photo.url);
        onChange(photos.filter(p => p.id !== id));
    };

    return (
        <div className="form-group">
            <label className="form-label">Photos</label>
            <div className="photo-grid">
                {photos.map(photo => (
                    <div key={photo.id} className="photo-thumb">
                        <img src={photo.url} alt="Attached" />
                        <button className="photo-remove" onClick={() => handleRemove(photo.id)}>
                            <X size={10} />
                        </button>
                    </div>
                ))}
                <button className="photo-add-btn" onClick={() => fileRef.current?.click()}>
                    <Camera size={20} />
                    <span>Add</span>
                </button>
            </div>
            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleAdd}
                style={{ display: 'none' }}
            />
        </div>
    );
}
