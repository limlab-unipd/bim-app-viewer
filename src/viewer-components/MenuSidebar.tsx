import * as React from 'react';
import * as BUI from '@thatopen/ui';
import { useNavigate } from 'react-router-dom';

export function MenuSidebar(props:{startingPage:string}) {
    const navigate = useNavigate();

    // Componente titolo (una sola volta)
    const [pageTitle, updatePageTitle] = React.useMemo(() => BUI.Component.create<HTMLDivElement, { page: string }>((state: { page: string }) => {
            const { page } = state;

            // Divide la parola in lettere singole
            const letters = page.split('').map((letter) => {
                return BUI.html`
                <h1 style="display:inline-block; margin:0 0.1em; font-family:'Roboto Mono', monospace; font-weight:lighter; text-transform:uppercase;">
                    ${letter}
                </h1>`
                });

            return BUI.html`
                <div style="display:flex; flex-direction:column; justify-content:flex-start; align-items:center; width:100%; position:absolute; top:0; left:50%; transform:translateX(-50%); padding-top:0.5rem;">
                    ${letters}
                </div>
            `;
        }, { page: props.startingPage }), []);

    const setSidebar = React.useCallback(() => {
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
                        updatePageTitle({ page: e.currentTarget.id });
                    }}>
                    </bim-button>
                    <bim-button
                    id='Viewer'
                    icon="ph:cube-focus-bold"
                    tooltip-title="BIM Viewer"
                    style="display:flex; min-width:2.5rem; min-height:2.5rem; align-items:center; justify-content:center"
                    @click=${(e: any) => {
                        navigate('/');
                        updatePageTitle({ page: e.currentTarget.id });
                    }}>
                    </bim-button>
                    <bim-button
                    id='Survey'
                    icon="wpf:survey"
                    tooltip-title="Survey"
                    style="display:flex; min-width:2.5rem; min-height:2.5rem; align-items:center; justify-content:center"
                    @click=${(e: any) => {
                        navigate('/survey');
                        updatePageTitle({ page: e.currentTarget.id });
                    }}>
                    </bim-button>
                    <bim-button
                    id='Info'
                    icon="akar-icons:info-fill"
                    tooltip-title="Info"
                    style="display:flex; min-width:2.5rem; min-height:2.5rem; align-items:center; justify-content:center"
                    @click=${(e: any) => {
                        navigate('/info');
                        updatePageTitle({ page: e.currentTarget.id });
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

    }, [navigate, pageTitle, updatePageTitle]);

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
            }}
        />
    );
}
