import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import * as WEBIFC from 'web-ifc'
import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'
import * as BUI from '@thatopen/ui'
import { generateUUID } from 'three/src/math/MathUtils.js'
import { readArrow } from './readArrow'
import { normalizeAndMapToColor, urbanMapToColor } from './colors'


export async function colorBar (
        components:OBC.Components,
        dataBySuburb:any,
        LOD:number,
        name:string,
        param:string,
    ) {

    // array di righe (già filtrate)
    const rows = dataBySuburb; // tuo array

    // estrai valori "name"
    const values = rows.map((r:any) => r[param] as number);

    // calcola min e max
    const min = Math.min(...values);
    const max = Math.max(...values);

    // normalizza
    const normalized = values.map((v:any) => (v - min) / (max - min));

    // crea mappa identfr da dati Ray - valore normalizzato del parametro scelto
    const map_identfr_normValue: Record<string, number> = {};
    for (let i = 0; i < rows.length; i++) {
        const key = String(rows[i].identfr);
        map_identfr_normValue[key] = normalized[i];
    }

    const fragments = components.get(OBC.FragmentsManager)
    const highlighter = components.get(OBCF.Highlighter)

    // sceglie solo il modello con -DELTA nel nome, che è quello con le geometrie
    let model: FRAGS.FragmentsModel
    let modelName: string
    for (const [mName,m] of fragments.list.entries()){
        if (mName.toUpperCase().includes(name.concat('-DELTA'))) {
            model = m
            modelName = mName
        }
    }

    // prende tutti gli id creati e crea le mappe:
    // localId - valore normalizzato
    // localId - identfr
    const ids = await model!.getLocalIds()
    const map_id_normValue: {[key:string]:number} = {}
    const map_id_identfr: {[key:string]:number} = {}
    for (const id of ids) {
        const item = await model!.getItemsData([id])
        const identfr = (item[0].Name as FRAGS.ItemAttribute).value
        map_id_normValue[id] = map_identfr_normValue[identfr]
        map_id_identfr[id] = identfr
    }

    // crea la ModelIdMap da inserire nell'highlighter con il nome del modello e i localId degli oggetti
    const map_model_localIds: OBC.ModelIdMap = {}
    map_model_localIds[modelName!] = new Set<number>(Object.keys(map_id_normValue).map(Number))

    // colora tutti gli oggetti
    const colorScaleDropdown = document.getElementById('color-scale-dropdown') as BUI.Dropdown
    urbanMapToColor(components, map_id_normValue, colorScaleDropdown.value[0], modelName!)
}