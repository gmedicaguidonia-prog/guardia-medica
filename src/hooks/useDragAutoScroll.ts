import { useEffect } from 'react'

/**
 * Durante un drag&drop HTML5 nativo il browser NON fa scorrere la pagina quando
 * ci si avvicina ai bordi e sopprime la rotellina del mouse: così non si riesce
 * a trascinare un elemento verso punti più in basso (o più in alto).
 *
 * Questo hook, mentre `active` è true (cioè mentre si sta trascinando):
 *  - scrolla automaticamente il contenitore quando il puntatore è vicino al
 *    bordo alto/basso della finestra (continuo, via requestAnimationFrame);
 *  - tenta comunque di gestire la rotellina (alcuni browser la lasciano passare).
 * Scrolla il primo antenato scrollabile sotto il puntatore (es. il <main> della
 * sezione admin), altrimenti la finestra.
 */
export function useDragAutoScroll(active: boolean) {
  useEffect(() => {
    if (!active) return
    const EDGE = 90      // px dal bordo entro cui parte lo scroll
    const MAX = 22       // velocità massima (px per frame)
    let raf = 0
    let speed = 0
    let target: HTMLElement | Window = window

    function scrollableFrom(x: number, y: number): HTMLElement | Window {
      let el = document.elementFromPoint(x, y) as HTMLElement | null
      while (el) {
        const st = getComputedStyle(el)
        if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 2) return el
        el = el.parentElement
      }
      return window
    }
    function scrollBy(t: HTMLElement | Window, dy: number) {
      if (t === window) window.scrollBy(0, dy)
      else (t as HTMLElement).scrollTop += dy
    }
    function onOver(e: DragEvent) {
      const y = e.clientY
      const vh = window.innerHeight
      target = scrollableFrom(e.clientX, y)
      if (y < EDGE) speed = -Math.ceil(((EDGE - y) / EDGE) * MAX)
      else if (y > vh - EDGE) speed = Math.ceil(((y - (vh - EDGE)) / EDGE) * MAX)
      else speed = 0
    }
    function onWheel(e: WheelEvent) {
      scrollBy(scrollableFrom(e.clientX, e.clientY), e.deltaY)
      e.preventDefault()
    }
    function stop() { speed = 0 }
    function loop() { if (speed !== 0) scrollBy(target, speed); raf = requestAnimationFrame(loop) }

    document.addEventListener('dragover', onOver)
    document.addEventListener('wheel', onWheel, { passive: false })
    document.addEventListener('drop', stop)
    document.addEventListener('dragend', stop)
    raf = requestAnimationFrame(loop)
    return () => {
      document.removeEventListener('dragover', onOver)
      document.removeEventListener('wheel', onWheel)
      document.removeEventListener('drop', stop)
      document.removeEventListener('dragend', stop)
      cancelAnimationFrame(raf)
    }
  }, [active])
}
