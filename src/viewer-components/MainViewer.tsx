import * as React from 'react'
import * as OBC from '@thatopen/components'
import * as BUI from '@thatopen/ui'
//import * as FRAGS from '@thatopen/fragments'

//import * as CUI from '@thatopen/ui-obc'
//import * as WEBIFC from 'web-ifc'
//import * as THREE from "three"
//import * as OBCF from '@thatopen/components-front'

export function MainViewer () {
    BUI.Manager.init()
    const components = new OBC.Components()
    
    const setViewer = () => {
        //VIEWER COMPONENT
        const worlds = components.get(OBC.Worlds)
        //SINGLE VIEWER
        const world = worlds.create<
        OBC.SimpleScene,
        OBC.SimpleCamera,
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
        world.camera = new OBC.SimpleCamera(components)
        world.camera.controls.setLookAt(74, 16, 0.2, 30, -4, 27) // convenient position for the model we will load
        //INITIALIZE ALL COMPONENTS
        components.init()

        const grids = components.get(OBC.Grids)
        const grid = grids.create(world)
        grid.config.color.set('#1C1C1C')
    }

    React.useEffect(() => {
        setViewer() //set the viewer
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
}