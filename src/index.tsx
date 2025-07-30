import * as ReactDOM from 'react-dom/client'
import * as Router from 'react-router-dom'
import './custom-element.d.ts'

import { ViewerPage } from './viewer-components/ViewerPage'

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