// src/custom-elements.d.ts
export {}

declare global {
    namespace JSX {
        interface IntrinsicElements {
        'bim-grid': any
        'bim-button': any
        'bim-label': any
        'bim-text-input': any
        'bim-icon': any
        'bim-input': any
        'bim-dropdown': any
        'bim-option': any
        'bim-color-input': any
        'bim-number-input': any
        'bim-viewport': any
        'bim-toolbar': any
        'bim-table': any
        'bim-checkbox': any
        }
    }
}