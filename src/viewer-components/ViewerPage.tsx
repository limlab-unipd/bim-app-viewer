import { MainViewer } from "./MainViewer";/*import { BarLeft } from "./BarLeft";
import { BarDown } from "./BarDown";
import { BarRight } from "./BarRight";
export function ViewerPage() {
    return (
        <div style={{ position:"relative", height: "100vh", overflow:"hidden"}}>
            <MainViewer />
            <div style={{display: "flex", height: "100vh", position: "relative", zIndex: "1", pointerEvents:"none"}}>
                <div style={{display: "flex", height: "100vh", width:"75px", flexDirection: "column", pointerEvents:"auto"}}>

                </div>
                <BarLeft />
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ flex: 1, backgroundColor:"rgba(255,255,255,0)"}} />
                    <BarDown />
                </div>
                <BarRight />
            </div>
        </div>
    );
}*/
export function ViewerPage() {
    return (
        <MainViewer />
    );
}