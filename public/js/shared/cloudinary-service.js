/**
 * Cloudinary Configuration & Service for RE-CAPS
 * Handles direct unsigned image uploads, thumbnail transformations, and gallery helpers.
 */

const CloudinaryService = {
    // =========================================================================
    // ⚙️ CONFIGURATION: Set your Cloudinary credentials here
    // =========================================================================
    config: {
        // Your Cloudinary Cloud Name (e.g. 'dyxxxxxxxx' or 're-caps')
        cloudName: 'xdapms0n', // <-- Replace with your Cloud Name if different
        
        // Your Unsigned Upload Preset name (e.g. 'recaps_projects')
        uploadPreset: 'recaps_projects_images', // <-- Replace with your Upload Preset name
        
        // Folder inside Cloudinary Media Library
        folder: 'recaps/projects_images',
        
        // Max image size in bytes (10MB)
        maxFileSizeBytes: 10 * 1024 * 1024,
        
        // Allowed formats
        allowedFormats: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
    },

    /**
     * Check if Cloudinary is configured with valid credentials
     */
    isConfigured() {
        return (
            this.config.cloudName &&
            this.config.cloudName !== 'YOUR_CLOUD_NAME' &&
            this.config.uploadPreset &&
            this.config.uploadPreset !== 'YOUR_UPLOAD_PRESET'
        );
    },

    /**
     * Upload a single file to Cloudinary using Unsigned Upload Preset
     * @param {File} file - File object from file input
     * @param {Function} onProgress - Callback with progress percentage (0-100)
     * @returns {Promise<{url: string, secure_url: string, public_id: string, width: number, height: number, format: string}>}
     */
    async uploadImage(file, onProgress = null) {
        if (!this.isConfigured()) {
            throw new Error(
                'Cloudinary is not configured. Please set your cloudName and uploadPreset in cloudinary-config.js'
            );
        }

        if (!this.config.allowedFormats.includes(file.type)) {
            throw new Error(`Unsupported file format (${file.type}). Allowed: JPG, PNG, WEBP`);
        }

        if (file.size > this.config.maxFileSizeBytes) {
            throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max limit is 10MB.`);
        }

        const url = `https://api.cloudinary.com/v1_1/${this.config.cloudName}/image/upload`;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', this.config.uploadPreset);
        if (this.config.folder) {
            formData.append('folder', this.config.folder);
        }

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);

            if (xhr.upload && onProgress) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percent = Math.round((e.loaded / e.total) * 100);
                        onProgress(percent);
                    }
                });
            }

            xhr.onreadystatechange = () => {
                if (xhr.readyState === XMLHttpRequest.DONE) {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            resolve({
                                url: data.secure_url || data.url,
                                secure_url: data.secure_url,
                                public_id: data.public_id,
                                width: data.width,
                                height: data.height,
                                format: data.format
                            });
                        } catch (err) {
                            reject(new Error('Failed to parse Cloudinary response: ' + err.message));
                        }
                    } else {
                        let errMsg = `Upload failed with status ${xhr.status}`;
                        try {
                            const errData = JSON.parse(xhr.responseText);
                            if (errData.error && errData.error.message) {
                                errMsg = errData.error.message;
                            }
                        } catch (_) {}
                        reject(new Error(errMsg));
                    }
                }
            };

            xhr.onerror = () => {
                reject(new Error('Network error occurred while uploading to Cloudinary'));
            };

            xhr.send(formData);
        });
    },

    /**
     * Upload multiple image files with progress tracking
     * @param {File[]} files - Array of File objects
     * @param {Function} onFileProgress - Callback(fileIndex, percent)
     * @returns {Promise<Array<{url: string, public_id: string}>>}
     */
    async uploadMultipleImages(files, onFileProgress = null) {
        const results = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const result = await this.uploadImage(file, (percent) => {
                if (onFileProgress) onFileProgress(i, percent);
            });
            results.push(result);
        }
        return results;
    },

    /**
     * Transform a Cloudinary image URL on the fly (e.g. for book cover thumbnails)
     * @param {string} url - Original Cloudinary image URL
     * @param {Object} options - Transformation options
     * @returns {string} Transformed URL
     */
    getTransformedUrl(url, options = {}) {
        if (!url || !url.includes('cloudinary.com')) return url;

        const {
            width = 400,
            height = null,
            crop = 'limit', // 'limit', 'fill', 'thumb', 'scale'
            quality = 'auto',
            format = 'auto'
        } = options;

        const transforms = [`f_${format}`, `q_${quality}`];
        if (width) transforms.push(`w_${width}`);
        if (height) transforms.push(`h_${height}`);
        if (crop) transforms.push(`c_${crop}`);

        const transformStr = transforms.join(',');
        
        // Insert transformations after /upload/
        return url.replace('/upload/', `/upload/${transformStr}/`);
    },

    /**
     * Get an optimized thumbnail URL (e.g. 300x400 cover card)
     */
    getThumbnailUrl(url, width = 300, height = 400) {
        return this.getTransformedUrl(url, { width, height, crop: 'fill' });
    },

    /**
     * Extract public_id from Cloudinary URL
     * @param {string} url - Cloudinary image URL
     * @returns {string|null} - Public ID or null if not a Cloudinary URL
     */
    extractPublicId(url) {
        if (!url || !url.includes('cloudinary.com')) return null;
        
        try {
            // URL format: https://res.cloudinary.com/CLOUD_NAME/image/upload/VERSION/PUBLIC_ID.FORMAT
            const parts = url.split('/upload/');
            if (parts.length < 2) return null;
            
            const afterUpload = parts[1];
            // Remove version prefix (v1234567890/) if present
            const withoutVersion = afterUpload.replace(/^v\d+\//, '');
            // Remove file extension
            const publicId = withoutVersion.replace(/\.[^.]+$/, '');
            
            return publicId;
        } catch (error) {
            console.error('Error extracting public_id:', error);
            return null;
        }
    },

    /**
     * Delete image from Cloudinary via backend API
     * @param {string} url - Cloudinary image URL
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async deleteImage(url) {
        const publicId = this.extractPublicId(url);
        if (!publicId) {
            console.warn('Could not extract public_id from URL:', url);
            return { success: false, message: 'Invalid Cloudinary URL' };
        }

        try {
            const backendUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                ? 'http://localhost:3001'
                : 'https://recap-backend-jy5b.onrender.com';

            const response = await fetch(`${backendUrl}/api/cloudinary/delete`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ publicId })
            });

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error deleting image from Cloudinary:', error);
            return { success: false, message: error.message };
        }
    },

    /**
     * Delete multiple images from Cloudinary
     * @param {string[]} urls - Array of Cloudinary image URLs
     * @returns {Promise<{deletedCount: number, failedCount: number, results: Array}>}
     */
    async deleteMultipleImages(urls) {
        const results = {
            deletedCount: 0,
            failedCount: 0,
            results: []
        };

        for (const url of urls) {
            const result = await this.deleteImage(url);
            results.results.push({ url, ...result });
            
            if (result.success) {
                results.deletedCount++;
            } else {
                results.failedCount++;
            }
        }

        return results;
    }
};

if (typeof window !== 'undefined') {
    window.CloudinaryService = CloudinaryService;
}
