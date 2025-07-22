import * as ReactDOM from 'react-dom/client'
import * as Router from 'react-router-dom'

import * as BUI from '@thatopen/ui'
import { ViewerPage } from './viewer-components/ViewerPage'


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

BUI.Manager.init()

//#region REACT COMPONENTS
const rootElement = document.getElementById('app') as HTMLDivElement
const appRoot = ReactDOM.createRoot(rootElement)
appRoot.render(
    <>
    <Router.BrowserRouter>
        <Router.Routes>
            <Router.Route path='/home' element={ <ViewerPage /> } />
        </Router.Routes>
    </Router.BrowserRouter>
    </>
)
//#endregion