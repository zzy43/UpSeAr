/**
 * 航图面板样式定义
 */

const PanelStyles = {
    getStyles: function() {
        return `
            #image-overlay-panel {
                position: fixed;
                top: 80px;
                right: 10px;
                width: 340px;
                background: rgba(30, 30, 40, 0.95);
                backdrop-filter: blur(10px);
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                z-index: 1000;
                font-size: 13px;
                color: #eee;
                border: 1px solid rgba(255,255,255,0.2);
                transition: all 0.3s ease;
                max-height: 85vh;
                overflow-y: auto;
            }
            .image-panel-header {
                padding: 12px 15px;
                background: rgba(0,0,0,0.5);
                border-radius: 12px 12px 0 0;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                font-weight: bold;
                position: sticky;
                top: 0;
                background: rgba(30,30,40,0.98);
                z-index: 1;
            }
            .image-panel-content {
                padding: 12px;
                border-top: 1px solid rgba(255,255,255,0.1);
            }
            .image-panel-content.collapsed {
                display: none;
            }
            .upload-area {
                margin-bottom: 12px;
            }
            .upload-label {
                display: block;
                background: #4CAF50;
                padding: 10px;
                text-align: center;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                transition: background 0.2s;
            }
            .upload-label:hover {
                background: #45a049;
            }
            #jeppesenImageInput {
                display: none;
            }
            .panel-buttons {
                display: flex;
                gap: 10px;
                margin-bottom: 12px;
            }
            .btn-primary, .btn-secondary {
                flex: 1;
                padding: 10px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: bold;
                transition: all 0.2s;
                font-size: 13px;
            }
            .btn-primary {
                background: #2196F3;
                color: white;
            }
            .btn-primary:hover {
                background: #0b7dda;
            }
            .btn-secondary {
                background: #f44336;
                color: white;
            }
            .btn-secondary:hover {
                background: #da190b;
            }
            .image-list {
                margin-top: 12px;
                border-top: 1px solid rgba(255,255,255,0.1);
                padding-top: 12px;
            }
            .image-list-title {
                font-size: 11px;
                color: #aaa;
                margin-bottom: 8px;
            }
            .image-item {
                background: rgba(0,0,0,0.4);
                border-radius: 6px;
                padding: 10px;
                margin-bottom: 8px;
                font-size: 11px;
            }
            .image-item-name {
                font-weight: bold;
                margin-bottom: 6px;
                word-break: break-all;
                font-size: 11px;
            }
            .image-item-bounds {
                font-size: 10px;
                color: #aaa;
                margin-bottom: 8px;
                font-family: monospace;
            }
            .image-item-controls {
                display: flex;
                gap: 10px;
                align-items: center;
                flex-wrap: wrap;
            }
            .image-item-controls span {
                font-size: 10px;
                min-width: 50px;
            }
            .image-item-controls input {
                flex: 2;
                min-width: 100px;
                height: 6px;
                cursor: pointer;
            }
            .image-item-controls button {
                background: #f44336;
                border: none;
                padding: 5px 10px;
                border-radius: 4px;
                cursor: pointer;
                color: white;
                font-size: 10px;
                min-width: 45px;
            }
            .image-item-controls button.edit-item {
                background: #2196F3;
            }
            .image-item-controls button.edit-item:hover {
                background: #0b7dda;
            }
            .image-item-controls button.remove-item:hover {
                background: #da190b;
            }
            .hint {
                font-size: 10px;
                color: #aaa;
                text-align: center;
                margin-top: 8px;
                line-height: 1.4;
            }
            .panel-toggle {
                background: none;
                border: none;
                color: white;
                cursor: pointer;
                font-size: 16px;
            }
            .edit-dialog-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                z-index: 2000;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .edit-dialog {
                background: #2a2a2e;
                border-radius: 12px;
                width: 340px;
                padding: 20px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                border: 1px solid #555;
            }
            .edit-dialog h4 {
                margin: 0 0 15px 0;
                color: #eee;
                font-size: 16px;
            }
            .edit-dialog .coord-row {
                display: flex;
                gap: 8px;
                margin-bottom: 12px;
                align-items: center;
            }
            .edit-dialog .coord-row span {
                width: 50px;
                font-size: 12px;
                color: #ccc;
            }
            .edit-dialog .coord-row input {
                flex: 1;
                background: #1a1a1e;
                border: 1px solid #555;
                padding: 8px;
                border-radius: 6px;
                color: white;
                font-size: 13px;
            }
            .edit-dialog .hint {
                font-size: 10px;
                color: #888;
                margin-top: 8px;
                text-align: center;
            }
            .edit-dialog-buttons {
                display: flex;
                gap: 10px;
                margin-top: 15px;
            }
            .edit-dialog-buttons button {
                flex: 1;
                padding: 8px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: bold;
            }
            .edit-dialog-buttons .save-btn {
                background: #4CAF50;
                color: white;
            }
            .edit-dialog-buttons .cancel-btn {
                background: #555;
                color: white;
            }
            @media (max-width: 768px) {
                #image-overlay-panel {
                    width: 300px;
                    top: 70px;
                    right: 5px;
                    font-size: 11px;
                    max-height: 70vh;
                }
                .image-item-controls {
                    flex-wrap: wrap;
                }
                .image-item-controls input {
                    min-width: 80px;
                }
            }
        `;
    }
};