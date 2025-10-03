import * as React from 'react';
import * as BUI from '@thatopen/ui';
import { useNavigate } from 'react-router-dom';

export function MenuSidebar() {
    const navigate = useNavigate();

    React.useEffect(() => {
        BUI.Manager.init();

        const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
        return BUI.html`
            <bim-toolbar style="justify-self: center; background-color:transparent; border:none" vertical>
            <bim-toolbar-section label="Sidebar">
                <bim-button
                id='Home'
                icon="ic:round-home"
                tooltip-title="Home"
                style="display:flex; min-width:2.5rem; min-height:2.5rem; align-items:center; justify-content:center"
                @click=${() => navigate('/home')}>
                </bim-button>
                <bim-button
                id='Viewer'
                icon="ph:cube-focus-bold"
                tooltip-title="BIM Viewer"
                style="display:flex; min-width:2.5rem; min-height:2.5rem; align-items:center; justify-content:center"
                @click=${() => navigate('/')}>
                </bim-button>
                <bim-button
                id='Survey'
                icon="wpf:survey"
                tooltip-title="Survey"
                style="display:flex; min-width:2.5rem; min-height:2.5rem; align-items:center; justify-content:center"
                @click=${() => navigate('/survey')}>
                </bim-button>
                <bim-button
                id='Info'
                icon="akar-icons:info-fill"
                tooltip-title="Info"
                style="display:flex; min-width:2.5rem; min-height:2.5rem; align-items:center; justify-content:center"
                @click=${() => navigate('/info')}>
                </bim-button>
            </bim-toolbar-section>
            </bim-toolbar>
        `;
        });

        const menuSidebarDiv = document.getElementById('menu-sidebar-div') as HTMLElement;
        menuSidebarDiv?.appendChild(toolbar);

        return () => {
        // Pulizia per evitare duplicati
            menuSidebarDiv.innerHTML = "";
        };
    }, [navigate]);

    return (
        <div
            id="menu-sidebar-div"
            style={{
                display:'flex',
                alignItems:'center',
                margin: '0px',
                backgroundColor: 'var(--background)',
            }}
        />
    );
}
