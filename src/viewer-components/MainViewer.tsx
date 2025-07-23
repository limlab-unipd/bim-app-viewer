import * as React from 'react'
import * as OBC from '@thatopen/components'
import * as BUI from '@thatopen/ui'
//import * as FRAGS from '@thatopen/fragments'
//import * as CUI from '@thatopen/ui-obc'
//import * as WEBIFC from 'web-ifc'
import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'

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
        await world.camera.controls.setLookAt(30,30,30,0,0,0) // convenient position for the model we will load
        //INITIALIZE ALL COMPONENTS
        components.init()

        const grids = components.get(OBC.Grids)
        const grid = grids.create(world)
        grid.config.color.set('#1C1C1C')

        components.get(OBC.Raycasters).get(world);

        const highlighter = components.get(OBCF.Highlighter);
        highlighter.zoomToSelection = true;
        highlighter.setup({
            world,
            selectMaterialDefinition: {
                // you can change this to define the color of your highligthing
                color: new THREE.Color("#bcf124"),
                opacity: 1,
                transparent: false,
                renderedFaces: 0,
            },
        });

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
    //components needed for logics
    const ifcLoader = components.get(OBC.IfcLoader);
    
    //function to load the IFC file
    const loadIfcFile = async (path: string) => {
        const file = await fetch(path);
        const data = await file.arrayBuffer();
        const buffer = new Uint8Array(data);
        await ifcLoader.load(buffer, false, "loadIfc");
    };
    
    // Function to load an IFC file triggered by the button
    const onLoadIfc = async ({target}:{target:BUI.Button}) => {
        //methods to open the file dialog and select an IFC file
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".ifc";
        input.onchange = async (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (file) {
                const url = URL.createObjectURL(file);
                target.loading = true; // Set loading state
                target.label = "Loading IFC...";
                
                const startTime = performance.now(); // Start timer
                await loadIfcFile(url);
                const endTime = performance.now(); // End timer
                const loadTime = ((endTime - startTime) / 1000).toFixed(2); // seconds
                console.log(`IFC loaded in ${loadTime} seconds`);

                target.loading = false; // Set loading state
                target.label = "Load IFC";
                
                URL.revokeObjectURL(url);
            }
        };
        input.click();
    }
    // #endregion

    // #region UI COMPONENTS WITH LOGICS    
    const panelLeft = BUI.Component.create<BUI.Panel>(() => {
        return BUI.html`
        <bim-panel
            label="Left Panel"
            style="background-color:rgba(0,0,0,0.85);">
        </bim-panel>
        `;
    })
    const panelRight = BUI.Component.create<BUI.Panel>(() => {
        return BUI.html`
        <bim-panel
            label="Right Panel"
            style="background-color:rgba(0,0,0,0.85);">
        </bim-panel>
        `;
    })
    const panelDown = BUI.Component.create<BUI.Panel>(() => {
        return BUI.html`
        <bim-panel
            label="Down Panel"
            style="background-color:rgba(0,0,0,0.85);">
        </bim-panel>
        `;
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
            const onSetLayout = ({target}:{target:BUI.Button}) => {
                const btn = target.id
                if (floatingGrid.layout == undefined) return

                if (floatingGrid.layout == btn) {
                    floatingGrid.layout = "main" as any
                } else if (floatingGrid.layout == 'main') {
                    floatingGrid.layout = btn as any
                } else {
                    if (["left", "right"].includes(floatingGrid.layout) && ["left", "right"].includes(btn)) {
                        floatingGrid.layout = "left_right" as any
                        console.log('ok')
                    } else if (floatingGrid.layout == "left_right" && btn == "left") {
                        floatingGrid.layout = "right" as any
                    } else if (floatingGrid.layout == "left_right" && btn == "right") {
                        floatingGrid.layout = "left" as any
                    } else {
                        floatingGrid.layout = btn as any
                    }
                } 
            }
            return BUI.html`
            <bim-toolbar style="justify-self: center">
                <bim-toolbar-section label="Load">
                    <bim-button
                        label="Sample"
                        @click=${() => {loadIfcFile("/assets/Sample elements with costs.ifc")}}>
                    </bim-button>
                    <bim-button
                        icon="tabler:cube-plus"
                        tooltip-title="IFC"
                        @click=${onLoadIfc}>
                    </bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="Panels">
                        <bim-button
                            id="left"
                            label="Left"
                            @click=${onSetLayout}>
                        </bim-button>
                        <bim-button
                            id="down"
                            label="Down"
                            @click=${onSetLayout}>
                        </bim-button>
                        <bim-button
                            id="right"
                            label="Right"
                            @click=${onSetLayout}>
                        </bim-button>
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
            left: {
                template: `
                    "panelLeft toolbar" auto
                    "panelLeft empty" 1fr
                    /20% 1fr
                `,
                elements: {
                    panelLeft,
                    toolbar
                }
            },
            right: {
                template: `
                    "toolbar panelRight" auto
                    "empty panelRight" 1fr
                    /1fr 20%
                `,
                elements: {
                    panelRight,
                    toolbar
                }
            },
            down: {
                template: `
                    "toolbar" auto
                    "empty" 1fr
                    "panelDown" 20%
                    /1fr
                `,
                elements: {
                    panelDown,
                    toolbar
                }
            },
            left_right: {
                template: `
                    "panelLeft toolbar panelRight" auto
                    "panelLeft empty panelRight" 1fr
                    /20% 1fr 20%
                `,
                elements: {
                    panelLeft,
                    panelRight,
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