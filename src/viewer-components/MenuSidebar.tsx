import * as React from 'react';
import * as BUI from '@thatopen/ui';
import { useNavigate, useLocation } from 'react-router-dom';

export function MenuSidebar() {
    const navigate = useNavigate();
    const location = useLocation(); // hoo for current url
    const page = location.pathname.replace('/', '') || ''
    let upTitle = page
    let downTitle = ''
    if (page=='') {
        upTitle='viewer'
        downTitle='costs'
    } else if (page=='urban-viewer') {
        upTitle='viewer'
        downTitle='urban'
    }

    // Sidebar up title component
    const pageTitle = BUI.Component.create<HTMLDivElement>(() => {
        // divide word in single letters
        const letters = upTitle.split('').map((letter) => {
            return BUI.html`
            <h1 style="display:inline-block; margin:0 0.1em; font-family:'Orbitron', monospace; font-weight:lighter; color:rgba(224, 224, 224, 0.75); text-transform:uppercase;">
                ${letter}
            </h1>`
        })
        return BUI.html`
            <div style="display:flex; flex-direction:column; justify-content:flex-start; align-items:center; width:100%; position:absolute; top:0; left:50%; transform:translateX(-50%); padding-top:0.5rem;">
                ${letters}
            </div>`
    })
    // Sidebar down title component
    const pageDownTitle = BUI.Component.create<HTMLDivElement>(() => {
        // divide word in single letters
        const letters = downTitle.split('').map((letter) => {
            const displayLetter = letter === ' ' ? '\u00A0' : letter; //if there is a needed space as character
            return BUI.html`
            <h1 style="display:inline-block; margin:0 0.1em; font-family:'Orbitron', monospace; font-weight:lighter; color:rgba(224, 224, 224, 0.75); text-transform:uppercase;">
                ${displayLetter}
            </h1>`
        })
        return BUI.html`
            <div style="display:flex; flex-direction:column; justify-content:flex-end; align-items:center; width:100%; position:absolute; bottom:0; left:50%; transform:translateX(-50%); padding-top:0.5rem;">
                ${letters}
            </div>`
    })

    const setSidebar = () => {
        const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
        return BUI.html`
            <bim-toolbar style="background-color:transparent; border:none; position:absolute; top:50%; left:50%; transform:translate(-50%, -50%)" vertical>
                <bim-toolbar-section label="Sidebar">
                    <bim-button
                        id='Home'
                        icon="ic:round-home"
                        tooltip-title="Home"
                        style="display:flex; min-width:2.5rem; min-height:2.5rem; align-items:center; justify-content:center"
                        @click=${(e: any) => {
                            navigate('/home');
                        }}>
                    </bim-button>
                    <bim-button
                        id='Viewer'
                        icon="ph:cube-focus-bold"
                        tooltip-title="Costs Viewer"
                        style="display:flex; min-width:2.5rem; min-height:2.5rem; align-items:center; justify-content:center"
                        @click=${(e: any) => {
                            navigate('/');
                        }}>
                    </bim-button>
                    <bim-button
                        id='Urban-Viewer'
                        icon="fluent:city-24-regular"
                        tooltip-title="Urban Viewer"
                        style="display:none; min-width:2.5rem; min-height:2.5rem; align-items:center; justify-content:center"
                        @click=${(e: any) => {
                            navigate('/urban-viewer');
                        }}>
                    </bim-button>
                    <bim-button
                        id='Survey'
                        icon="wpf:survey"
                        tooltip-title="Survey"
                        style="display:flex; min-width:2.5rem; min-height:2.5rem; align-items:center; justify-content:center"
                        @click=${(e: any) => {
                            navigate('/survey');
                        }}>
                    </bim-button>
                    <bim-button
                        id='Info'
                        icon="akar-icons:info-fill"
                        tooltip-title="Info"
                        style="display:flex; min-width:2.5rem; min-height:2.5rem; align-items:center; justify-content:center"
                        @click=${(e: any) => {
                            navigate('/info');
                        }}>
                    </bim-button>
                </bim-toolbar-section>
            </bim-toolbar>
        `;
        });

        const menuSidebarDiv = document.getElementById('menu-sidebar-div') as HTMLElement;
        menuSidebarDiv.innerHTML = '';
        menuSidebarDiv.appendChild(pageTitle);
        menuSidebarDiv.appendChild(toolbar);
        menuSidebarDiv.appendChild(pageDownTitle);
    };

    React.useEffect(() => {
        setSidebar();
    }, [setSidebar]);

    return (
        <div
            id="menu-sidebar-div"
            style={{
                height: '100%',
                width: '100%',
                margin: '0px',
                backgroundColor: 'var(--background)',
                position: 'relative',
                zIndex: 10,
            }}
        />
    );
}
