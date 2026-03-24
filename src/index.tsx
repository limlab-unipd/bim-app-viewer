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
            <Router.Routes>
                <Router.Route
                    path="/home"
                    element={
                        <div className="home-shell">
                            <MenuSidebar />
                            <HomePage />
                        </div>
                    }
                />
                <Router.Route
                    path="/"
                    element={
                        <div className="app-layout">
                            <MenuSidebar />
                            <MainViewer />
                        </div>
                    }
                />
                <Router.Route
                    path="/urban-viewer"
                    element={
                        <div className="app-layout">
                            <MenuSidebar />
                            <UrbanViewer />
                        </div>
                    }
                />
                <Router.Route
                    path="/survey"
                    element={
                        <div className="app-layout">
                            <MenuSidebar />
                            <SurveyPage />
                        </div>
                    }
                />
                <Router.Route
                    path="/info"
                    element={
                        <div className="app-layout">
                            <MenuSidebar />
                            <InfoPage />
                        </div>
                    }
                />
            </Router.Routes>
        </Router.BrowserRouter>
    </>
)
//#endregion