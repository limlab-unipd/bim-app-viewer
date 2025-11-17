import * as OBC from '@thatopen/components'
import * as BUI from '@thatopen/ui'
import * as OBCF from '@thatopen/components-front'
import type { Identifier, ItemAttribute, ItemData } from '@thatopen/fragments';


const onSearch = (e: Event, table:BUI.Table<any>) => {
    const input = e.target as BUI.TextInput;
    table.queryString = input.value !== "" ? input.value : null
}
const onClearPanel = async (panel: BUI.Panel, title:string='Void Panel') => {
    panel.innerHTML = ''
    panel.label = title
}
const onSortTable = (table:BUI.Table<any>, field:string, ascending:boolean=true) => {
    const direction = ascending ? 1 : -1
    table.data.sort((a, b) => {
        const valA = a.data[field]
        const valB = b.data[field]
        // Se entrambi sono numeri
        if (typeof valA === 'number' && typeof valB === 'number') {
            return (valA - valB) * direction
        }
        // Ordinamento alfabetico
        return valA.toString().localeCompare(valB.toString()) * direction
    })

    for (const suburb of table.data){
        if (!suburb.children) continue;
        (suburb.children as BUI.TableGroupData<any>[]).sort((a, b) => {
            const valA = a.data[field]
            const valB = b.data[field]
            // Se entrambi sono numeri
            if (typeof valA === 'number' && typeof valB === 'number') {
                return (valA - valB) * direction
            }
            // Ordinamento alfabetico
            return valA.toString().localeCompare(valB.toString()) * direction
        })
        for (const block of suburb.children){
            if (!block.children) continue
            (block.children as BUI.TableGroupData<any>[]).sort((a, b) => {
                const valA = a.data[field]
                const valB = b.data[field]
                // Se entrambi sono numeri
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return (valA - valB) * direction
                }
                // Ordinamento alfabetico
                return valA.toString().localeCompare(valB.toString()) * direction
            })
        }
    }

    table.requestUpdate()
}

export async function createTable (panelDown:BUI.Panel,fragments:OBC.FragmentsManager,components:OBC.Components,paramOne:string='Concret',paramTwo:string='Glass'): Promise<BUI.Table<any>> {

    const highlighter = components.get(OBCF.Highlighter)
    await onClearPanel(panelDown)

    //CREATE THE TABLE
    type tableType = {
        modelId:string,
        localId:number,
        Suburb: string,
        Param1: number,
        Param2: number,
        Color:any,
    }
    const urbanTable = document.createElement("bim-table") as BUI.Table<tableType>
    urbanTable.id = 'urban-table'
    urbanTable.data = [{
        data: {
            Suburb: '',
            Param1: 1,
            Param2: 1,
            Color: '',
        }
    }]
    urbanTable.data = []
    urbanTable.preserveStructureOnFilter = true
    urbanTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"
    urbanTable.hiddenColumns = ['modelId', 'localId']

    for (const [modelName,model] of fragments.list.entries()){
        if (modelName.includes('DELTA')) continue //non considera il modello DELTA
        const items = await model.getItems()
        // get attributes and relations of bar
        const barsData = await fragments.getData({[modelName]:new Set(items.keys())},{
            attributesDefault: true,
            relationsDefault: {
                attributes: true,
                relations: true //here is the only point where could be accepted because there are only few relations to load and they are in a closed loop
            }
        })
        // get color of bar
        for (const itemData of barsData[modelName]){
            let color: string = ''
            switch (true) {
                case (highlighter.selection.LOD_0_color_0_02?.[modelName]?.has((itemData._localId as ItemAttribute).value)): //optional chaining check needed because sometimes some ranges are empty
                    color = highlighter.styles.get('LOD_0_color_0_02')?.color.getStyle()!
                    break;
                case (highlighter.selection.LOD_0_color_02_04?.[modelName]?.has((itemData._localId as ItemAttribute).value)):
                    color = highlighter.styles.get('LOD_0_color_02_04')?.color.getStyle()!
                    break;
                case (highlighter.selection.LOD_0_color_04_06?.[modelName]?.has((itemData._localId as ItemAttribute).value)):
                    color = highlighter.styles.get('LOD_0_color_04_06')?.color.getStyle()!
                    break;
                case (highlighter.selection.LOD_0_color_06_08?.[modelName]?.has((itemData._localId as ItemAttribute).value)):
                    color = highlighter.styles.get('LOD_0_color_06_08')?.color.getStyle()!
                    break;
                case (highlighter.selection.LOD_0_color_08_1?.[modelName]?.has((itemData._localId as ItemAttribute).value)):
                    color = highlighter.styles.get('LOD_0_color_08_1')?.color.getStyle()!
                    break;
            };
            // get all psets localids of bar
            const pSetsLocalIds: Identifier[] = [];
            (itemData.IsDefinedBy as ItemData[]).forEach((x:ItemData) => { //questo legge l'id del pset collegato dall'attributo IsDefinedBy della barra -> il ciclo serve se ci sono piu pset, restituisce tutti gli id
                pSetsLocalIds.push((x._localId as ItemAttribute).value)
            })
            //get psets data of previous local ids
            let pSets = await model.getItemsData(pSetsLocalIds)
            pSets = pSets.filter(item => (item.Name as ItemAttribute).value == 'EnvironmentalAnalysisData') //mantiene solo i pset con quel nome
            //aggiunge le righe nella tabella
            urbanTable.data.push({
                data: {
                    modelId: modelName,
                    localId: (itemData._localId as ItemAttribute).value,
                    Suburb: (itemData.Name as ItemAttribute).value,
                    Param1: Math.round((pSets[0][paramOne] as ItemAttribute).value*1000)/1000,
                    Param2: Math.round((pSets[0][paramTwo] as ItemAttribute).value*1000)/1000,
                    Color: color,
                }
            })
        }
    }
    urbanTable.dataTransform.Suburb = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
        const { modelId, localId } = rowData
        return BUI.html`
            <bim-label 
                @click=${() => {
                    highlighter.highlightByID("select", {[modelId as string]: new Set<number>([localId as number])}, false, true)
                    }}
                @mouseover=${({target}:{target:BUI.Label}) => {target.style.color = "rgba(36, 241, 234, 1)"}}
                @mouseleave=${({target}:{target:BUI.Label}) => {target.style.removeProperty('color')}}
            >
                ${value}
            </bim-label>`
    }
    urbanTable.dataTransform.Color = (value) => { //color also the total resource cost in the table with the same color of related element
        return BUI.html`<div style="height:1rem; width: 1rem; border-radius:5px; background-color:${value}; color:${value};">.</div>`
    }

    const sortByColumn = BUI.Component.create<BUI.Dropdown>(
        () => BUI.html`
            <bim-dropdown name="sortTable" style="max-width:fit-content"
                @change="${(e:Event) => {
                    if (!e.target) return
                    const ascending = sortByDirection.icon=='meteor-icons:arrow-up' ? false : true
                    onSortTable(urbanTable, (e.target as any).value[0]), ascending}}">
                <bim-option style="padding:0 0.5rem 0 0.5rem" label="Suburb" value="Suburb" icon='lets-icons:map-light'></bim-option>
                <bim-option style="padding:0 0.5rem 0 0.5rem" label=${paramOne} value='Param1' icon='icon-park-outline:one-key'></bim-option>
                <bim-option style="padding:0 0.5rem 0 0.5rem" label=${paramTwo} value='Param2' icon='icon-park-outline:two-key'></bim-option>
            </bim-dropdown>`,
    )
    const sortByDirection = BUI.Component.create<BUI.Dropdown>(
        () => BUI.html`
            <bim-button icon='meteor-icons:arrow-up' style="max-width:fit-content; z-index:100" tooltip-text='Ascending or descending order'
                @click="${(e:Event) => {
                    if (!e.target) return
                    const button = e.target as BUI.Button
                    button.icon = button.icon=='meteor-icons:arrow-up' ? 'meteor-icons:arrow-down' : 'meteor-icons:arrow-up'
                    const ascending = button.icon=='meteor-icons:arrow-up' ? false : true
                    onSortTable(urbanTable, sortByColumn.value[0], ascending)}}">
            </bim-button>`,
    )

    //CREATE THE PANEL
    const urbanDownPanel = BUI.Component.create<BUI.Panel>(() => {
        return BUI.html`
        <bim-panel style="display:flex; flex-direction:column; gap:10px; margin:10px; background-color:transparent; flex:1;">
            <div style=${BUI.styleMap({display:'flex', flexDirection:'column', gap:'10px', margin:'10px'})}>
                <div style="display: flex; gap: 0.5rem;">
                    <bim-label>Sort by:</bim-label>
                    ${sortByColumn}
                    ${sortByDirection}
                    <bim-text-input placeholder="Search..." @input=${(e:Event)=>{onSearch(e,urbanTable)}}></bim-text-input>
                    <bim-button @click=${() => {onClearPanel(panelDown)}} tooltip-title='Clear Panel' icon='carbon:clean' style="max-width:fit-content; z-index:100"></bim-button>
                    <bim-button tooltip-text="Click on item's name to add it to the selection" icon='majesticons:lightbulb-shine' style="max-width:fit-content; z-index:100; background:none; background-color:transparent !important"></bim-button>
                </div>
                ${urbanTable}
            </div>
        </bim-panel>`
    })

    //APPEND THE PANEL
    panelDown.label = `CANBERRA SUBURBS`
    panelDown.appendChild(urbanDownPanel)
    
    return urbanTable
}