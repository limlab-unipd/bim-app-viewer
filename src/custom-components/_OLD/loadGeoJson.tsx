import { globalCentroid } from "./parametersForGrouping"
import * as THREE from 'three';

// Supponiamo che scene sia la tua THREE.Scene già creata
export async function loadGeoJson(path: string, scene: THREE.Scene) {

    // Funzione per creare Mesh da MultiPolygon
    function createMeshFromGeoJSON(geojson: any) {
        const group = new THREE.Group();

        geojson.features.forEach((feature: any) => {
            if (feature.geometry.type === "MultiPolygon") {
            feature.geometry.coordinates.forEach((polygon: number[][][]) => {
                polygon.forEach((ring: number[][]) => {
                    const shape = new THREE.Shape();
                    ring.forEach((coord, i) => {
                        const x = coord[0] - globalCentroid.x;
                        const z = coord[1] - globalCentroid.y;
                        const y = coord[2] - 0;
                        //console.log(coord)

                        if (i === 0) shape.moveTo(x, z);
                        else shape.lineTo(x, z);
                    });

                    // Crea geometria 3D con altezza z
                    const geometry = new THREE.ExtrudeGeometry(shape, {
                        depth: 10, // z se vuoi estrudere
                        bevelEnabled: false
                    });
                    geometry.translate(0,  ring[0][2] || 0, 0);

                    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.position.y = 0
                    mesh.rotation.x = Math.PI / 2
                    group.add(mesh);
                });
            });
            }
        });

        return group;
    }

    // Caricamento GeoJSON
    fetch(path)
    .then(res => res.json())
    .then((geojson) => {
        const meshGroup = createMeshFromGeoJSON(geojson);
        scene.add(meshGroup);
    });
}