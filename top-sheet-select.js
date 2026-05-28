export default class TopSheetSelect {
    /** @type {HTMLElement} */
    triggerNode = null
    /** @type {Function} */
    dataStore = null
    /** @type {boolean} */
    #showing = false
    /** @type {HTMLElement} */
    #domNode = null
    #hiddenInput = null
    #listeners = {}
    #opacityNode = null
    #copyNode = null
    #dataNode = null
    #previousScrollY = 0
    #vkeyboardResizeTimeout = null
    #eventAbortController = null
    
    #toSearchKey(str) {
        /* german ... */
        return str.toLowerCase()
            .replace(/(ae|oe|ue)/g, (match) => match[0])
            .replace(/[äöü]/g, (match) => {
                const map = { 'ä': 'a', 'ö': 'o', 'ü': 'u' };
                return map[match];
            })
            .replace(/ß/g, 'ss')
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    /**
     * @param {HTMLElement} triggerNode
     * @param {Function} dataLoadCallback
     */
    constructor(triggerNode, dataStore) {
        if (!(triggerNode instanceof HTMLElement)) {
            throw new Error('Expect triggerNode to be HTMLElement')
        }
        if (!(dataStore instanceof Object)) {
            throw new Error('Expect dataStore to be Object')
        }
        /* transform into an input if it is not an input */
        if (triggerNode.tagName != 'INPUT') {
            Object.defineProperty(triggerNode, 'value', {
                get: function() { return this.getAttribute('value') },
                set: function(newValue) {
                    if (newValue === undefined) {
                        return this.removeAttribute('value')
                    }
                    return this.setAttribute('value', newValue) 
                }
            })
            Object.defineProperty(triggerNode, 'name', {
                get: function() { return this.getAttribute('name') },
                set: function(newValue) { return this.setAttribute('name', newValue) }
            })
            this.#hiddenInput = document.createElement('input')
            Object.assign(this.#hiddenInput.style, {
                display: 'none'
            })
            this.#hiddenInput.name = triggerNode.name ?? triggerNode.id
            triggerNode.parentNode.insertBefore(this.#hiddenInput, triggerNode.nextElementSibling)
        }
        this.triggerNode = triggerNode
        this.dataStore = dataStore
        this.#installEvents()
    }

    static create(triggerNode, dataStore) {
        return new Promise((resolve, reject) => {
            const obj = new TopSheetSelect(triggerNode, dataStore)
            if (!obj.triggerNode.value) {
                return resolve(obj)
            }
            obj.dataStore.get(obj.triggerNode.value)
            .then(value => {
                if (value) {
                    obj.setDisplayValue(value)
                } else {
                    obj.reset()
                }
                return resolve(obj)
            })
        })
    }

    destroy() {
        this.#removeEvents()
        window.requestAnimationFrame(() => {
            if (this.#copyNode && this.#copyNode.parentNode) { this.#copyNode.remove() }
            if (this.#opacityNode && this.#opacityNode.parentNode) { this.#opacityNode.remove() }
        })
    }


    #scrollIntoView(node) {
        const sbox = node.getBoundingClientRect()
        const pbox = node.parentElement.getBoundingClientRect()
        const scrollTop = node.parentElement.scrollTop + (sbox.top - pbox.top) - (pbox.height / 2) + (sbox.height / 2)
        window.requestAnimationFrame(() => this.#dataNode.scrollTop = scrollTop)
    }

    #debounce(callback, delay) {
        let timer = null
        return function(...args) {
            clearTimeout(timer)
            timer = setTimeout(() => callback(...args), delay)
        }

    }

    #resizeEventHandler(event) {
        if (!this.#showing) { return }
       
        this.#applyDimensions(this.#computeDimensions())
        .then(_ => {
            const selectedNode = this.#dataNode.querySelector('.selected')
            if (selectedNode) { 
                this.#scrollIntoView(selectedNode)
            }
        })
    }
    
    #installEvents() {
        if (this.#eventAbortController) { return }
        this.#eventAbortController = new AbortController()
        window.visualViewport.addEventListener('resize',  this.#debounce(this.#resizeEventHandler.bind(this), 100), {signal: this.#eventAbortController.signal})
        this.triggerNode.addEventListener('click', event => this.toggle(event), {signal: this.#eventAbortController.signal})
    }
    
    #removeEvents() {
        if (!this.#eventAbortController) { return }
        this.#eventAbortController.abort()
    }

    /**
     * @param {Event} event
     */
    toggle(event) {
        if (this.#showing) {
            return this.hide()
        }
        Promise.all([this.renderList(), this.renderSheet()])
        .then(([dataNode, domNode]) => {
            domNode.appendChild(dataNode)

            const selectedNode = dataNode.querySelector('.selected')
            
            this.#domNode = domNode
            this.#dataNode = dataNode
            this.#previousScrollY = window.scrollY
            this.#showing = true

            this.#applyDimensions(this.#computeDimensions())
            .then(_ => {
                this.#domNode.firstElementChild.focus()
                if (selectedNode) {
                    this.#scrollIntoView(selectedNode)
                }
            })
        })
        .catch(error => {
            /* handle error */
        })
    }

    renderList() {
        const { signal } = this.#eventAbortController
        return new Promise((resolve, reject) => {
            const value = this.#hiddenInput ? this.#hiddenInput.value : undefined
            this.dataStore.list()
            .then(items => {
                const dataNode = document.createElement('DIV')
                dataNode.classList.add('top-sheet-data-node')
                items.forEach(item => {
                    const itemNode = document.createElement('DIV')
                    if (item.is_sep) {
                        itemNode.innerHTML = item.displayName
                        itemNode.dataset.separator = true
                        itemNode.classList.add('top-sheet-item-separator')
                        dataNode.appendChild(itemNode)
                        return
                    }
                    itemNode.classList.add('top-sheet-item')
                    /* not up to us to check if it's XSS, and we should be able to
                     * have beautiful content with color and all */
                    itemNode.innerHTML = item.displayName
                    itemNode.dataset.filterValue = item.filterValue ?? item.displayName
                    itemNode.dataset.effectiveValue = item.value
                    if (item.value == value) {
                        itemNode.classList.add('selected')
                    }
                    dataNode.appendChild(itemNode)
                })
                dataNode.addEventListener('click', (event) => {
                    this.selectItem(event)
                }, { signal })
                resolve(dataNode)
            })
        })
    }

    setDisplayValue(v) {
        const value = this.triggerNode.querySelector('.value')
        if (value) {
            value.innerHTML = v.displayName
        }

    }

    reset() {
        if (this.triggerNode) {
            const value = this.triggerNode.querySelector('.value')
            if (value) {
                value.innerHTML = ''
            }
        }
    }

    selectItem(event) {
        if (!(event.target instanceof HTMLElement)) { return }
        if (!event.target.dataset.effectiveValue) { return }
        const value = event.target.dataset.effectiveValue
        this.setDisplayValue({displayName: event.target.innerHTML})
        const changeEvent = new Event("change")
        Object.assign(changeEvent, {
            value: value
        })
        this.#hiddenInput.setAttribute('value', value)
        this.triggerNode.dispatchEvent(changeEvent)
        this.hide()
    }

    #getNextSelectable() {
        let startPoint = this.#domNode.querySelector('.selected')
        if (!startPoint) {
            startPoint = this.#domNode.lastElementChild.firstElementChild
            if (startPoint.style.display != 'none' && !startPoint.dataset.separator) { return startPoint }
        }
        let node = startPoint
        do {
            node = node.nextElementSibling
            if (!node) {
                node = this.#domNode.lastElementChild.firstElementChild
            }
            if (node.style.display != 'none' && !node.dataset.separator ) { break }
        } while(node != startPoint)
        if (node.style.display == 'none' || node.dataset.separator) {
            return null
        }
        return node
    }

    selectNext() {
        const node = this.#getNextSelectable()
        if (node) {
            const previousSelected = this.#domNode.querySelector('.selected')
            if (previousSelected) {
                previousSelected.classList.remove('selected')
            }
            node.classList.add('selected')
            node.scrollIntoView()
        }
    }

    #getPreviousSelectable() {
        let startPoint = this.#domNode.querySelector('.selected')
        if (!startPoint) {
            startPoint = this.#domNode.lastElementChild.lastElementChild
            if (startPoint.style.display != 'none' && !startPoint.dataset.separator) { return startPoint }
        }
        let node = startPoint
        do {
            node = node.previousElementSibling
            if (!node) {
                node = this.#domNode.lastElementChild.lastElementChild
            }
            if (node.style.display != 'none' && !node.dataset.separator) { break }
        } while(node != startPoint)
        if (node.style.display == 'none' || node.dataset.separator) {
            return null
        }
        return node
    }

    selectPrevious() {
        const node = this.#getPreviousSelectable()
        if (node) {
            const previousSelected = this.#domNode.querySelector('.selected')
            if (previousSelected) {
                previousSelected.classList.remove('selected')
            }
            node.classList.add('selected')
            node.scrollIntoView()
        }
    }

    renderSheet() {
        const { signal } = this.#eventAbortController
        return new Promise((resolve, reject) => {
            if (this.#domNode instanceof HTMLElement) {
                this.#domNode.firstElementChild.value = ''
                return resolve(this.#domNode)
            }

            this.#opacityNode = document.createElement('DIV')
            this.#opacityNode.classList.add('top-sheet-opacity-node')
            this.#copyNode = this.triggerNode.cloneNode(true)
            this.#copyNode.removeAttribute('id')
            this.#copyNode.classList.add('top-sheet-sizable-width-node',
                                         'top-sheet-sizable-node')
            this.#copyNode.addEventListener('click', event => this.hide(), { signal })

            const domNode = document.createElement('DIV')
            domNode.classList.add('top-sheet-container',
                                  'top-sheet-sizable-width-node',
                                  'top-sheet-sizable-height-node',
                                  'top-sheet-sizable-node')
            const inputDomNode = document.createElement('INPUT')
            inputDomNode.classList.add('top-sheet-input')
                                       
            inputDomNode.setAttribute('type', 'text')
            inputDomNode.setAttribute('size', '1')
            inputDomNode.setAttribute('width', '1')
            inputDomNode.addEventListener('keyup', event => {
                switch(event.key) {
                    case 'ArrowDown': 
                    case 'ArrowUp': 
                    case 'Enter': 
                    case 'Escape':
                    case 'End':
                    case 'Home':
                        event.preventDefault()
                        return 
                }
                this.filter(event.target.value)
            }, { signal })
            inputDomNode.addEventListener('keydown', event => {
                switch(event.key) {
                    case 'ArrowDown': {
                        event.preventDefault()
                        this.selectNext()
                    } return
                    case 'ArrowUp': {
                        event.preventDefault()
                        this.selectPrevious()
                    } return
                    case 'Enter': {
                        event.preventDefault()
                        const currentSelected = this.#domNode.querySelector('.selected')
                        if (currentSelected) {
                            this.triggerNode.value = currentSelected.dataset.effectiveValue
                            const value = this.triggerNode.querySelector('.value')
                            if (value) {
                                value.innerHTML = currentSelected.innerHTML
                            }
                            this.toggle()
                        }
                    } return
                    case 'Escape': {
                        event.preventDefault()
                        this.toggle()
                    } return
                    case 'Home': {
                        const currentSelected = this.#domNode.querySelector('.selected')
                        if (currentSelected) {
                            currentSelected.classList.remove('selected')
                        }
                        this.selectNext()
                    } return
                    case 'End': {
                        const currentSelected = this.#domNode.querySelector('.selected')
                        if (currentSelected) {
                            currentSelected.classList.remove('selected')
                        }
                        this.selectPrevious()
                    } return

                }
            }, { signal })

            domNode.appendChild(inputDomNode)
            resolve(domNode)
        })
    }

    hide() {
        return new Promise((resolve, _) => {
            if (!(this.#domNode instanceof HTMLElement)) {
                return resolve()
            }
            this.#showing = false
            window.requestAnimationFrame(() => {
                if (this.#dataNode) { this.#dataNode.remove() }
                if (this.#opacityNode) { this.#opacityNode.remove() } 
                if (this.#copyNode) { this.#copyNode.remove() }
                this.#domNode.remove()
                resolve()
            })
        }).then(_ => {
            this.#dataNode = null
            if (this.#previousScrollY != window.scrollY) {
                window.scrollTo(window.scrollX, this.#previousScrollY)
            }
        })
    }

    #computeDimensions() {
        const triggerNodeRect = this.triggerNode.getBoundingClientRect()
        return {
            height: (window.visualViewport.height - triggerNodeRect.height) * 0.9,
            left: triggerNodeRect.left,
            top: triggerNodeRect.height, 
            width: triggerNodeRect.width,
        }
    }

    #applyDimensions(dimensions) {
        return new Promise((resolve, _) => {
            window.requestAnimationFrame(() => {
                if (!this.#opacityNode.parentNode) { document.body.appendChild(this.#opacityNode) }
                if (!this.#copyNode.parentNode) { document.body.appendChild(this.#copyNode) }
                if (!this.#domNode.parentNode) { document.body.appendChild(this.#domNode) }
                
                const widthString = `${dimensions.width}px`
                const leftString = `${(window.visualViewport.width / 2) - (dimensions.width / 2)}px`
                const heightString = `${dimensions.height}px`
                
                this.#domNode.style.setProperty( '--tss-height',  heightString)
                this.#domNode.style.setProperty( '--tss-width' ,  widthString)
                this.#domNode.style.setProperty( '--tss-left'  ,  leftString)
                this.#domNode.style.setProperty( '--tss-top'   ,  `${dimensions.top}px`)
                this.#copyNode.style.setProperty('--tss-width' ,  widthString)
                this.#copyNode.style.setProperty('--tss-left'  ,  leftString)
                this.#copyNode.style.setProperty('--tss-top'   ,  '0px')
                this.#copyNode.innerHTML = this.triggerNode.innerHTML

                resolve()
            })
        })
    }

    /**
     */
    filter(text) {
        const dataNode = this.#domNode.lastElementChild
        const hideNodes = []
        const showNodes = []
        Array.from(dataNode.children).forEach(node => {
            if (node.dataset.separator) {
                showNodes.push(node)
                return
            }
            text = this.#toSearchKey(text) 
            const strings = String(node.dataset.filterValue).split('|')
                .map(str => this.#toSearchKey(str))

            if (strings.some(str => str.indexOf(text) != -1)) {
                showNodes.push(node)
            } else {
                hideNodes.push(node)
            }
        })
        window.requestAnimationFrame(() => {
            hideNodes.forEach(node => {
                node.style.display = 'none'
                node.classList.remove('selected')
            })
            showNodes.forEach(node => {
                node.style.display = ''
            })
        })
    }
    
}
