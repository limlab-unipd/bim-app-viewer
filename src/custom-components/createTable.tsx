import * as OBC from '@thatopen/components'
import * as BUI from '@thatopen/ui'
import * as OBCF from '@thatopen/components-front'
import type { Identifier, ItemAttribute, ItemData } from '@thatopen/fragments';
import { formatNumber } from './conversion';


const onSearch = (e: Event, table:BUI.Table<any>) => {
    const input = e.target as BUI.TextInput;
    table.queryString = input.value !== "" ? input.value : null
}
const onClearPanel = async (panel: BUI.Panel, title:string='Void Panel') => {
    panel.innerHTML = ''
    panel.label = title
}
const onSortTable = (table: BUI.Table<any>, field: string, ascending: boolean = false) => {
    // ordine ascendente o discendente
    const direction = ascending ? 1 : -1;
    // funzione per capire se il valore è un numero
    const isNumeric = (v: any) =>
        typeof v === 'number' ||
        (typeof v === 'string' && !isNaN(Number(v)));
    // funzione per comparare i valori
    const compareValues = (valA: any, valB: any) => {
        const numA = isNumeric(valA) ? Number(valA) : null;
        const numB = isNumeric(valB) ? Number(valB) : null;
        if (numA !== null && numB !== null) {
            return (numA - numB) * direction;
        }
        return valA.toString().localeCompare(valB.toString()) * direction;
    };
    // ordinamento primo livello della tabella
    table.data.sort((a, b) => compareValues(a.data[field], b.data[field]));
    // ordinamento secondo livello
    for (const name of table.data) {
        if (!name.children) continue;
        (name.children as BUI.TableGroupData<any>[]).sort((a, b) =>
            compareValues(a.data[field], b.data[field])
        );
        //ordinamento terzo livello
        for (const block of name.children) {
            if (!block.children) continue;
            (block.children as BUI.TableGroupData<any>[]).sort((a, b) =>
                compareValues(a.data[field], b.data[field])
            );
        }
    }
    //update tabella
    table.requestUpdate();
};


export async function createTable (
    panelDown:BUI.Panel,
    fragments:OBC.FragmentsManager,
    components:OBC.Components,
    paramOne:string='Concret',
    paramTwo:string='Glass'
): Promise<BUI.Table<any>> {

    const highlighter = components.get(OBCF.Highlighter)
    await onClearPanel(panelDown)

    //CREATE THE TABLE
    type tableType = {
        modelId:string,
        localId:number,
        Name: string,
        Param1: string,
        Param2: string,
        Color:any,
    }
    const urbanTable = document.createElement("bim-table") as BUI.Table<tableType>
    urbanTable.id = 'urban-table'
    urbanTable.data = [{
        data: {
            Name: '',
            Param1: '1',
            Param2: '1',
            Color: '',
        }
    }]
    urbanTable.data = []
    urbanTable.preserveStructureOnFilter = true
    urbanTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"
    urbanTable.style.flex = "1";
    urbanTable.style.minWidth = "0";
    urbanTable.style.minHeight = "0";
    urbanTable.style.overflow = "auto";
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
                    Name: (itemData.Name as ItemAttribute).value,
                    Param1: (pSets[0][paramOne] as ItemAttribute).value,
                    Param2: (pSets[0][paramTwo] as ItemAttribute).value,
                    Color: color,
                }
            })
        }
    }
    urbanTable.dataTransform.Name = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
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
                <bim-option style="padding:0 0.5rem 0 0.5rem" label="Name" value="Name" icon='lets-icons:map-light'></bim-option>
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
            <bim-panel style="flex: 1; height: 100%; min-width: 0; min-height: 0; gap: 10px; background-color: transparent; padding: 16px;">
                <div style="display: flex;flex-direction: row;gap: 1rem;position: relative;inset: 0;width: 100%;height: 100%;min-width: 0;min-height: 0;overflow: hidden;">
                    <div style="display: flex;gap: 0.5rem;flex-shrink: 0;flex-direction: column;min-width:20%;">
                        <bim-label style="height: 2.2rem;font-weight: 600;flex-shrink: 0;border-bottom: 1px solid var(--bim-ui_bg-contrast-20);color: var(--bim-label--c, var(--bim-ui_bg-contrast-60));
                            font-size: var(--bim-label--fz, var(--bim-ui_size-xs));--bim-label--c: var(--bim-panel--c, var(--bim-ui_bg-contrast-80));--bim-label--fz: var(--bim-panel--fz, var(--bim-ui_size-sm));">
                            CANBERRA SUBURBS
                        </bim-label>
                        <div style="display: flex;gap: 0.5rem;flex-shrink: 0; flex-direction: row;">
                            <bim-label>Sort by:</bim-label>
                            ${sortByColumn}
                            ${sortByDirection}
                        </div>
                        <bim-text-input placeholder="Search..." @input=${(e:Event)=>{onSearch(e,urbanTable)}}></bim-text-input>
                        <div style="display: flex;gap: 0.5rem;flex-shrink: 0;flex-direction: row;">
                            <bim-label>Options: </bim-label>
                            <bim-button @click=${() => {onClearPanel(panelDown)}} tooltip-title='Clear Panel' icon='carbon:clean' style="max-width:fit-content; z-index:100"></bim-button>
                            <bim-button tooltip-text="Click on item's name to add it to the selection" icon='majesticons:lightbulb-shine' style="max-width:fit-content; background:none; background-color:transparent !important; z-index:100"></bim-button>
                        </div>
                    </div>
                    ${urbanTable}
                </div>
            </bim-panel>
        `
    })

    //APPEND THE PANEL
    panelDown.label = ``
    panelDown.appendChild(urbanDownPanel)
    
    return urbanTable
}