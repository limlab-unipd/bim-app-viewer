import * as ReactDOM from 'react-dom/client'
import * as Router from 'react-router-dom'

import { InfoPage } from './viewer-components/InfoPage'
import { MenuSidebar } from './viewer-components/MenuSidebar'
import { MainViewer } from './viewer-components/MainViewer'
import { HomePage } from './viewer-components/HomePage'
import { SurveyPage } from './viewer-components/SurveyPage'
import * as BUI from '@thatopen/ui'
import { UrbanViewer } from './viewer-components/UrbanViewer'

//#region REACT COMPONENTS
const rootElement = document.getElementById('app') as HTMLDivElement
const appRoot = ReactDOM.createRoot(rootElement)
BUI.Manager.init()
appRoot.render(
    <>
    <Router.BrowserRouter>
        <MenuSidebar></MenuSidebar>
        <Router.Routes>
            <Router.Route path='/home' element={ <HomePage /> } />
            <Router.Route path='/' element={ <MainViewer /> } />
            <Router.Route path='/urban-viewer' element={ <UrbanViewer /> } />
            <Router.Route path='/survey' element={ <SurveyPage /> } />
            <Router.Route path='/info' element={ <InfoPage /> } />
        </Router.Routes>
    </Router.BrowserRouter>
    </>
)
//#endregion