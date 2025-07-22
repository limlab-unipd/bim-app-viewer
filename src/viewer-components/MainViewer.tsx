import * as React from 'react'
import * as OBC from '@thatopen/components'
import * as BUI from '@thatopen/ui'
//import * as FRAGS from '@thatopen/fragments'
//import * as CUI from '@thatopen/ui-obc'
//import * as WEBIFC from 'web-ifc'
//import * as THREE from "three"
//import * as OBCF from '@thatopen/components-front'

export function MainViewer () {

    // #region GENERAL START
    BUI.Manager.init()
    const components = new OBC.Components()
    let globalScene: OBC.SimpleScene | undefined
    let globalWorld: OBC.World | undefined
    let globalCamera: OBC.OrthoPerspectiveCamera | undefined
    // #endregion
    
    // #region SET VIEWER
    const setViewer = async () => {
        //VIEWER COMPONENT
        const worlds = components.get(OBC.Worlds)
        //SINGLE VIEWER
        const world = worlds.create<
        OBC.SimpleScene,
        OBC.OrthoPerspectiveCamera,
        OBC.SimpleRenderer
        >()
        //SCENE
        world.scene = new OBC.SimpleScene(components)
        world.scene.setup()
        world.scene.three.background = null
        //RENDERER
        const container = document.getElementById("main-viewer")! as HTMLElement
        world.renderer = new OBC.SimpleRenderer(components, container)
        //CAMERA
        world.camera = new OBC.OrthoPerspectiveCamera(components)
        await world.camera.controls.setLookAt(74, 16, 0.2, 30, -4, 27) // convenient position for the model we will load
        //INITIALIZE ALL COMPONENTS
        components.init()

        const grids = components.get(OBC.Grids)
        const grid = grids.create(world)
        grid.config.color.set('#1C1C1C')

        globalScene = world.scene
        globalWorld = world
        globalCamera = world.camera

        // #region IFC LOADER SETUP
        const ifcLoader = components.get(OBC.IfcLoader)
        await ifcLoader.setup({
            autoSetWasm: false,
            wasm: {
                path: "https://unpkg.com/web-ifc@0.0.69/",
                absolute: true,
            },
        });
        const githubUrl ="https://thatopen.github.io/engine_fragment/resources/worker.mjs";
        const fetchedUrl = await fetch(githubUrl);
        const workerBlob = await fetchedUrl.blob();
        const workerFile = new File([workerBlob], "worker.mjs", {
            type: "text/javascript",
        });
        const workerUrl = URL.createObjectURL(workerFile);
        const fragments = components.get(OBC.FragmentsManager);
        fragments.init(workerUrl);
    
        globalWorld?.camera.controls?.addEventListener("rest", () =>
        fragments.core.update(true),
        );
    
        fragments.list.onItemSet.add(({ value: model }) => {
            const camera = globalCamera?.three
            if(camera){
                model.useCamera(camera);
                globalWorld?.scene.three.add(model.object);
                fragments.core.update(true);
            }
        });
        // #endregion
    }
    // #endregion
    
    
    // #region LOGIC FUNCTIONS
    // Function to load an IFC file triggered by the button
    const onLoadIfc = async () => {
        //ifc loader component
        const ifcLoader = components.get(OBC.IfcLoader);
        //function to load the IFC file
        const loadIfcFile = async (path: string) => {
            const file = await fetch(path);
            const data = await file.arrayBuffer();
            const buffer = new Uint8Array(data);
            await ifcLoader.load(buffer, false, "loadIfc");
        };
        //methods to open the file dialog and select an IFC file
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".ifc";
        input.onchange = (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (file) {
            const url = URL.createObjectURL(file);
            loadIfcFile(url);
            console.log('ciao come va?')
            URL.revokeObjectURL(url);
            }
        };
        input.click();
    }
    // #endregion

    // #region UI COMPONENTS WITH LOGICS
    const loadIfcButton = BUI.Component.create<BUI.Button>(() => {
        return BUI.html`
        <bim-button
        label="Load IFC"
        @click=${onLoadIfc}>
        </bim-button>
        `
    })
    // #endregion

    // #region METHOD TO SETUP THE UI OF THE VIEWER
    const setupUI = async () => {
        const viewerContainer = document.getElementById('main-viewer') as HTMLElement
        if (!viewerContainer) return
        
        //FLOATING GRID TO HOST THE TOOLBAR
        const floatingGrid = BUI.Component.create<BUI.Grid>(() => {
            return BUI.html`
                <bim-grid
                floating
                style="padding: 20px">
                </bim-grid>
            `;
        })
        
        //TOOLBAR COMPONENT
        const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
            
            return BUI.html`
            <bim-toolbar style="justify-self: center">
                <bim-toolbar-section label="Import">
                    ${loadIfcButton}
                </bim-toolbar-section>
            </bim-toolbar>
            `;
        })
        //GRID LAYOUT
        floatingGrid.layouts = {
            main: {
                template: `
                    "toolbar" auto
                    "empty" 1fr
                    /1fr
                `,
                elements: {
                    toolbar
                }
            },
        }
        floatingGrid.layout = "main" as any //set active layout

        viewerContainer.appendChild(floatingGrid) //append grid to the viewer container
    }
    // #endregion

    // #region FINAL PART
    React.useEffect(() => {
        setViewer() //set the viewer
        setupUI() //setup the UI of the viewer
        return () => {
            if (components) {
                components.dispose()
            }
        }
    }, [])

    return( //return the whole BIM viewer component
        <bim-viewport
            id="main-viewer"
            className="viewer"
        />
    )
    // #endregion
}