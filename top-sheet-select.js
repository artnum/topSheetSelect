export default class TopSheetSelect {
    static #idCounter = 0
    myId = 0
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
    #eventAbortController = null
    #itemNGrams = new Map()
    
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
       
        if (triggerNode.dataset.topSheetInstalled == '1') {
            throw new Error('Already installed on this node')
        }

        this.myId = ++TopSheetSelect.#idCounter
        
        this.#hiddenInput = document.createElement('input')
        Object.assign(this.#hiddenInput.style, {
            display: 'none'
        })
        this.#hiddenInput.name = triggerNode.name || triggerNode.id || `topSheetField-${this.myId}` 

        triggerNode.parentNode.insertBefore(this.#hiddenInput, triggerNode.nextElementSibling)

        this.triggerNode = triggerNode
        this.triggerNode.setAttribute('aria-controls', `top-sheet-list-${this.myId}`)
        this.triggerNode.setAttribute('role', 'combobox')
        this.triggerNode.setAttribute('aria-expanded', 'false')
        this.triggerNode.setAttribute('aria-haspopup', 'listbox')
        this.triggerNode.dataset.topSheetInstalled = '1'
        
        this.dataStore = dataStore
        
        this.#installEvents()
    }

    static create(triggerNode, dataStore) {
        return new Promise((resolve, reject) => {
            if (triggerNode.dataset.topSheetInstalled == '1') {
                return reject('Already installed on this node')
            }

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
            if (this.#copyNode && this.#copyNode.parentNode)       { this.#copyNode.remove()    }
            if (this.#opacityNode && this.#opacityNode.parentNode) { this.#opacityNode.remove() }
            if (this.#hiddenInput && this.#hiddenInput.parentNode) { this.#hiddenInput.remove() } 
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
        const mutObserver = new MutationObserver(mutList => {
            mutList.filter(m => m.removedNodes.length > 0)
                .forEach(m => {
                    const r = new Set(m.removedNodes)
                    if (r.has(this.triggerNode)) {
                        this.destroy()
                        return
                    }
                })
        })
        mutObserver.observe(this.triggerNode.parentElement, {childList: true})

        this.#eventAbortController = new AbortController()
        window.visualViewport.addEventListener('resize',  this.#debounce(this.#resizeEventHandler.bind(this), 100), {signal: this.#eventAbortController.signal})
        this.triggerNode.addEventListener('click', event => this.toggle(event), {signal: this.#eventAbortController.signal})
    }
    
    #removeEvents() {
        if (!this.#eventAbortController) { return }
        this.#eventAbortController.abort()
    }

    #markNodeSelected(node) {
        const previousSelected = this.#domNode.querySelector('.selected')
        if (previousSelected) {
            previousSelected.setAttribute('aria-selected', 'false')
            previousSelected.classList.remove('selected')
        }
        node.classList.add('selected')
        node.setAttribute('aria-selected', 'true')
        this.#getSearchInput().setAttribute('aria-activedescendant', node.id)
    }

    #getSearchInput() {
        if (this.#domNode) {
            return this.#domNode.querySelector('input')
        }
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
            this.triggerNode.setAttribute('aria-expanded', 'true')
            this.#applyDimensions(this.#computeDimensions())
            .then(_ => {
                this.#getSearchInput().focus()
                if (selectedNode) {
                    this.#getSearchInput().setAttribute('aria-activedescendant', selectedNode.id)
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
        const value = this.#hiddenInput ? this.#hiddenInput.value : undefined
        return this.dataStore.list()
        .then(items => {
            const dataNode = document.createElement('DIV')
            dataNode.classList.add('top-sheet-data-node')
            dataNode.id = `top-sheet-list-${this.myId}`
            dataNode.setAttribute('role', 'listbox')
            dataNode.setAttribute('aria-label', 'Options')

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
                itemNode.id = `top-sheet-${this.myId}-item-${item.value}`
                if (item.value == value) {
                    itemNode.classList.add('selected')
                    itemNode.setAttribute('aria-selected', 'true')
                } else {
                    itemNode.setAttribute('aria-selected', 'false')
                }
                itemNode.setAttribute('role', 'option')
                const grams = this.#generate2Grams(itemNode.dataset.filterValue)
                this.#itemNGrams.set(itemNode.id, grams)
                
                dataNode.appendChild(itemNode)
            })
            dataNode.addEventListener('click', (event) => {
                this.selectItem(event)
            }, { signal })
            return dataNode
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
        const item = event.target.closest('.top-sheet-item')
        if (!item || !item.dataset.effectiveValue) { return }
        const value = item.dataset.effectiveValue
        this.setDisplayValue({displayName: item.innerHTML})
        this.#hiddenInput.setAttribute('value', value)
        const changeEvent = new CustomEvent("change", { detail : { value }, bubbles: true })
        this.triggerNode.dispatchEvent(changeEvent)
        this.hide()
    }

    #getNextSelectable() {
        let startPoint = this.#domNode.querySelector('.selected')
        if (!startPoint) {
            startPoint = this.#dataNode.firstElementChild
            if (startPoint.style.display != 'none' && !startPoint.dataset.separator) { return startPoint }
        }
        if (!startPoint) { return }
        let node = startPoint
        do {
            node = node.nextElementSibling
            if (!node) {
                node = this.#dataNode.firstElementChild
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
            this.#markNodeSelected(node)
            node.scrollIntoView()
        }
    }

    #getPreviousSelectable() {
        let startPoint = this.#domNode.querySelector('.selected')
        if (!startPoint) {
            startPoint = this.#dataNode.lastElementChild
            if (startPoint.style.display != 'none' && !startPoint.dataset.separator) { return startPoint }
        }
        if (!startPoint) { return }
        let node = startPoint
        do {
            node = node.previousElementSibling
            if (!node) {
                node = this.#dataNode.lastElementChild
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
            this.#markNodeSelected(node)
            node.scrollIntoView()
        }
    }

    renderSheet() {
        const { signal } = this.#eventAbortController
        return new Promise((resolve, reject) => {
            if (this.#domNode instanceof HTMLElement) {
                this.#getSearchInput().value = ''
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
            inputDomNode.setAttribute('aria-autocomplete', 'list')
            inputDomNode.setAttribute('aria-controls', `top-sheet-list-${this.myId}`)
            inputDomNode.setAttribute('aria-activedescendant', '')
            inputDomNode.setAttribute('autocorrect' ,'off')
            inputDomNode.setAttribute('autocapitalize', 'none')
            inputDomNode.setAttribute('spellcheck', 'false')
            inputDomNode.setAttribute('autocomplete', 'off')

            inputDomNode.addEventListener('keyup', event => {
                switch(event.key) {
                    case 'ArrowDown': 
                    case 'ArrowUp': 
                    case 'Enter': 
                    case 'Escape':
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
                            const value = currentSelected.dataset.effectiveValue
                            this.#hiddenInput.setAttribute('value', value)
                            const valueNode = this.triggerNode.querySelector('.value')
                            if (valueNode) {
                                valueNode.innerHTML = currentSelected.innerHTML
                            }
                            const changeEvent = new CustomEvent("change", { detail: { value }, bubbles: true })
                            this.triggerNode.dispatchEvent(changeEvent)
                            this.toggle()
                        }
                    } return
                    case 'Escape': {
                        event.preventDefault()
                        this.toggle()
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
            this.triggerNode.setAttribute('aria-expanded', 'false')
            window.requestAnimationFrame(() => {
                if (this.#dataNode)    { this.#dataNode.remove()    }
                if (this.#opacityNode) { this.#opacityNode.remove() } 
                if (this.#copyNode)    { this.#copyNode.remove()    }
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
                if (!this.#copyNode.parentNode)    { document.body.appendChild(this.#copyNode)    }
                if (!this.#domNode.parentNode)     { document.body.appendChild(this.#domNode)     }
                
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

    #normalize(str) {
        return str.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }
   
    #generate2Grams(str) {
        const grams = []

        str.split(' ')
           .forEach(str => {
                if (str.length == 0) { return }
                const firstLetter = str[0]
                const l = str.slice(1).replace(/[aeiouy]/g, '')

                str =  firstLetter + l
                for(let i = 0; i < str.length - 1; i++) {
                    grams.push(str.slice(i, i+2))
                }
            })
        return grams
    }

    /**
     */
    filter(text) {
        const dataNode = this.#dataNode
        const hideNodes = []
        const showNodes = []
        text = this.#normalize(text)
        const searchGrams = this.#generate2Grams(text)
        const searchGramsSet = new Set(searchGrams)
        Array.from(dataNode.children).forEach(node => {
            if (node.dataset.separator) {
                showNodes.push(node)
                return
            }
            let score = 0
            
            let v = node.dataset.filterValue 
                    ? this.#normalize(String(node.dataset.filterValue))
                    : this.#normalize(String(node.textContent))

            if (v.startsWith(text)) {
                score = 0.8 + (text.length / 10)
            } else if (v.includes(text)) {
                score = 0.5 + (text.length / 10)
            } else {
                const gramsAvailable = this.#itemNGrams.get(node.id)
                if (gramsAvailable.length == 0) {
                    score = 0
                } else {
                    const commun = gramsAvailable.filter(n => searchGramsSet.has(n)).length
                    const union = new Set([...gramsAvailable, ...searchGrams]).size
                    score = commun / union
                }
            }

            if (score  > 0.15) {
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
