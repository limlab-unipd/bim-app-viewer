import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import * as WEBIFC from 'web-ifc'
import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'

export async function createBar2 (
        world:OBC.SimpleWorld<OBC.SimpleScene, OBC.OrthoPerspectiveCamera, OBCF.PostproductionRenderer>,
        fragments:OBC.FragmentsManager,
        geometryEngine:FRAGS.GeometryEngine,
    ) {

    const bytes = FRAGS.EditUtils.newModel({ raw: true });
    const newModel = await fragments.core.load(bytes, {
        modelId: "LOD_1",
        camera: world.camera.three,
        raw: true,
    });
    world.scene.three.add(newModel.object);
    await fragments.core.update(true);


    interface BarSettings {
        height: number, //altezza colonna
        baseWidth: number, //base colonna larghezza
        baseLength: number, //base colonna lnghezza
        position: THREE.Vector3, //posizione del primo vertice della barra
    }
    const barsList: BarSettings[] = [ //array con oggetti le dimensioni delle barre
        { height:10, baseWidth:1, baseLength:1, position:new THREE.Vector3(20,0,15) },
        { height:15, baseWidth:1, baseLength:1, position:new THREE.Vector3(16,0,12) },
        { height:30, baseWidth:1, baseLength:1, position:new THREE.Vector3(22,0,18) },
        { height:20, baseWidth:1, baseLength:1, position:new THREE.Vector3(15,0,17) },
        { height:12, baseWidth:1, baseLength:1, position:new THREE.Vector3(19,0,11) },
        { height:18, baseWidth:1, baseLength:1, position:new THREE.Vector3(27,0,8) },
        { height:24, baseWidth:1, baseLength:1, position:new THREE.Vector3(12,0,22) },
        { height:26, baseWidth:1, baseLength:1, position:new THREE.Vector3(14,0,10) },
    ]

    // Bar geometry
    const barGeometry = new THREE.BufferGeometry();

    // building generation logic
    let processing = false;
    const regenerateFragments = async () => {
        const elementsData: FRAGS.NewElementData[] = [];
        //await fragments.core.editor.reset(newModel.modelId)
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
        for (const set of barsList) {
            const bar_base_dim1 = set.baseLength;
            const bar_base_dim2 = set.baseWidth;
            const bar_height = set.height
            const bar_position = set.position
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
}