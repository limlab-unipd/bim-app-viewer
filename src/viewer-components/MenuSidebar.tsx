import * as React from 'react'
import * as BUI from '@thatopen/ui'

export function MenuSidebar () {
    
    BUI.Manager.init()
    
    const setMenuSidebar = () => {
        const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
            return BUI.html`
            <bim-toolbar style="justify-self: center; background-color:transparent; border:none" vertical>
                <bim-toolbar-section label="Sidebar">
                    <bim-button
                        id='Home'
                        icon="ic:round-home"
                        tooltip-title="Home"
                        style="display:flex; min-width:2.5rem; min-height:2.5rem; align-items:center; justify-content:center"
                        @click=${() => {window.location.href = '/home'}}>
                    </bim-button>
                    <bim-button
                        id='Viewer'
                        icon="ph:cube-focus-bold"
                        tooltip-title="BIM Viewer"
                        style="display:flex; min-width:2.5rem; min-height:2.5rem; align-items:center; justify-content:center"
                        @click=${() => {window.location.href = '/'}}>
                    </bim-button>
                    <bim-button
                        id='Survey'
                        icon="wpf:survey"
                        tooltip-title="Survey"
                        style="display:flex; min-width:2.5rem; min-height:2.5rem; align-items:center; justify-content:center"
                        @click=${() => {window.location.href = '/survey'}}>
                    </bim-button>
                    <bim-button
                        id='Info'
                        icon="akar-icons:info-fill"
                        tooltip-title="Info"
                        style="display:flex; min-width:2.5rem; min-height:2.5rem; align-items:center; justify-content:center"
                        @click=${() => {window.location.href = '/info'}}>
                    </bim-button>
                </bim-toolbar-section>
            </bim-toolbar>
            `;
        })
        
        const menuSidebarDiv = document.getElementById('menu-sidebar-div') as HTMLElement
        menuSidebarDiv?.appendChild(toolbar)
    }

    // #region FINAL PART
    React.useEffect(() => {
        setMenuSidebar() //set the viewer, devMode default = false
        return () => {}
    }, [])

    return (
        <div
            id="menu-sidebar-div"
            style={{
                display:'flex',
                alignItems:'center',
                margin: '0px',
                backgroundColor: 'var(--background)',
            }}
            >
        </div>
    );
};