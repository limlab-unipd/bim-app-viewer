import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import * as WEBIFC from 'web-ifc'
import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'
import { generateUUID } from 'three/src/math/MathUtils.js'
import { ACTON } from '../../public/JSON/ACTON'
import { BRADDON } from '../../public/JSON/BRADDON'
import { readArrow } from './readArrow'


/**
 * Create bar according to values.
 * @param world the world instance used to render the scene
 * @param fragments the FragmentsManager instance
 * @param geometryEngine the GeoemtryEngine instance
 * @param LOD the LOD you want to load
 * @param name the name of the bar to load the next LOD
 * @returns if the function correctly found the bar and created the next LOD or not
 */
export async function createBar (
        world:OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>,
        fragments:OBC.FragmentsManager,
        geometryEngine:FRAGS.GeometryEngine,
        LOD:number,
        name:string,
        variable:string,
    ): Promise<[boolean,string]> {

    const startTime = performance.now() // Start timer 

    const bytes = FRAGS.EditUtils.newModel({ raw: true });
    const newModel = await fragments.core.load(bytes, {
        modelId: `LOD_${LOD}_${name}`,
        camera: world.camera.three,
        raw: true,
    });
    world.scene.three.add(newModel.object);
    await fragments.core.update(true);



    // Read Arrow file
    const arrowData = await readArrow()
    name = name.toUpperCase()

    const dataBySuburb: any[] = [];
    const col = arrowData.getChild("DIVISION_N");
    if (!col) throw new Error("Colonna DIVISION_N non trovata");

    for (let i = 0; i < arrowData.numRows; i++) {
        if (col.get(i) === name) {
            dataBySuburb.push(arrowData.get(i));
        }
    }

    // Bar geometry
    const barGeometry = new THREE.BufferGeometry();

    // building generation logic
    let processing = false;
    const regenerateFragments = async () => {
        const elementsData: FRAGS.NewElementData[] = [];
        await fragments.core.editor.reset(newModel.modelId)
        // Create base items
        const matId = fragments.core.editor.createMaterial(
            newModel.modelId,
            new THREE.MeshLambertMaterial({ //materiale
                color: new THREE.Color(1, 1, 1),
                side: THREE.DoubleSide,
            }),
        );
        const ltId = fragments.core.editor.createLocalTransform(
            newModel.modelId,
            new THREE.Matrix4().identity(),
        );

        // Bars
        const tempObject = new THREE.Object3D();
        //creation of each bar
        for (const set of dataBySuburb) {
            let bar_base_dim1 = 1
            let bar_base_dim2 = 1
            let bar_height = set[variable]
            let bar_position = new THREE.Vector3(parseFloat(set.centroid_x_local)/20,0,parseFloat(set.centroid_y_local)/20)
            let bar_name = Number(set.identfr)
            
            //estrusione
            geometryEngine.getExtrusion(barGeometry, {
                profilePoints: [ //punti di base X,Z,Y (forse, oppure Y,Z,X)
                    0, 0, 0,
                    0, 0, bar_base_dim1,
                    bar_base_dim2, 0, bar_base_dim1,
                    bar_base_dim2, 0, 0,
                ],
                direction: [0, 1, 0], //vettore direzione
                cap: true,
                length: bar_height, //estrusione
            });
            //creazione shell
            const barGeoId = fragments.core.editor.createShell(
                newModel.modelId,
                barGeometry,
            );

            //sposta l'oggetto in posizione
            tempObject.position.copy(bar_position);
            tempObject.updateMatrix();

            //proprietà dell'oggetto appena creato (qui andranno inserite le eventuali proprietà IFC)
            elementsData.push({
                attributes: {
                    _category: {
                        value: "IfcBuildingElementProxy",
                    },
                    _guid: { value: generateUUID() },
                    Name: { value: bar_name },
                    Suburb: { value: set.DIVISION_N ? set.DIVISION_N : bar_name },
                    Height: { value: bar_height },
                    Aluminium: { value: set.Aluminm ? set.Aluminm : 0 },
                    Concrete: { value: set.Concret ? set.Concret : 0 },
                    Steel: { value: set.Steel ? set.Steel : 0 },
                },
                globalTransform: tempObject.matrix.clone(),
                samples: [
                    {
                        localTransform: ltId,
                        representation: barGeoId,
                        material: matId,
                    },
                ],
            });
        }
        await fragments.core.editor.createElements(newModel.modelId, elementsData);
        await fragments.core.update(true);
        processing = false;
    };

    await regenerateFragments();

    const endTime = performance.now() // End timer
    const loadTime = ((endTime - startTime) / 1000).toFixed(2) // seconds
    console.log(`Arrow loaded in ${loadTime} seconds`)

    return [true,loadTime]
}