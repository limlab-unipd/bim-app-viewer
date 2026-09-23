import * as ReactDOM from 'react-dom/client'
import * as Router from 'react-router-dom'
import * as React from 'react'

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

function CostViewerRedirect({ page }: { page: string }) {
    React.useEffect(() => {
        window.location.replace(page)
    }, [page])
    return null
}

BUI.Manager.init()
appRoot.render(
    <>
    <Router.BrowserRouter>
        <MenuSidebar></MenuSidebar>
        <Router.Routes>
            <Router.Route path='/home' element={ < CostViewerRedirect page = 'https://bim-app-viewer.vercel.app/home' />} />
            <Router.Route path='/cost-viewer' element={ < CostViewerRedirect page = 'https://bim-app-viewer.vercel.app' />} />
            <Router.Route path='/' element={ <UrbanViewer /> } />
            <Router.Route path='/survey' element={ < CostViewerRedirect page = 'https://bim-app-viewer.vercel.app/survey' />} />
            <Router.Route path='/info' element={ < CostViewerRedirect page = 'https://bim-app-viewer.vercel.app/info' />} />
        </Router.Routes>
    </Router.BrowserRouter>
    </>
)
//#endregion