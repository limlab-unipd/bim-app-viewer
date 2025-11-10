import * as OBC from '@thatopen/components'
import * as FRAGS from '@thatopen/fragments'
import * as OBCF from '@thatopen/components-front'
import * as BUI from '@thatopen/ui'
import { urbanMapToColor } from './colors'


export async function colorBar (
        components:OBC.Components,
        dataForBars:any,
        LOD:number,
        name:string,
        param:string,
    ) {

    // array di righe (già filtrate)
    const rows: any = Object.values(dataForBars); // tuo array

    // estrai valori "name"
    const values = LOD==0||LOD==1 ? rows.map((r:any) => Number(r.param_two)) : rows.map((r:any) => Number(r[param]))

    // calcola min e max
    const min = Math.min(...values);
    const max = Math.max(...values);

    // normalizza
    const normalized = values.map((v:any) => (v - min) / (max - min));

    // crea mappa identfr da dati Ray - valore normalizzato del parametro scelto
    const map_identfr_normValue: Record<string, number> = {};
    for (let i = 0; i < rows.length; i++) {
        const key = LOD==0 ? String(rows[i].suburb) : LOD==1 ? String(rows[i].section) : String(rows[i].identfr);
        map_identfr_normValue[key] = normalized[i];
    }

    const fragments = components.get(OBC.FragmentsManager)

    // sceglie solo il modello con -DELTA nel nome, che è quello con le geometrie
    let model: FRAGS.FragmentsModel
    let modelName: string
    for (const [mName,m] of fragments.list.entries()){
        if (mName.includes(name.concat('-DELTA'))) {
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
    const map_color_ids = urbanMapToColor(components, map_id_normValue, colorScaleDropdown.value[0], modelName!)

    return [map_color_ids,map_id_identfr,modelName!]
}