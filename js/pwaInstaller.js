// PWA Installer - Gerenciador de instalação do Progressive Web App
// Autor: Terra MIDI System
// Data: 20/10/2025
// Descrição: Gerencia prompt de instalação e atualizações do PWA
// Versão: 2.0 - Instalação personalizada com feedback visual e armazenamento local

class PWAInstaller {
    constructor() {
        this.deferredPrompt = null;
        this.installButton = null;
        this.isInstalled = false;
        this.isStandalone = false;
        this.directoryHandle = null; // Para File System Access API
        this.storageEstimate = null;
        this.persistenceGranted = false;
        
        console.log('📲 PWAInstaller v2.0 inicializado');
        
        this.init();
    }
    
    /**
     * Inicializa o instalador PWA
     */
    init() {
        // Verificar se já está instalado
        this.checkIfInstalled();
        
        // Encontrar botão de instalação
        this.installButton = document.getElementById('btn-install-pwa');
        
        // Listeners para prompt de instalação
        this.bindInstallPrompt();
        
        // Listener para detectar instalação
        this.bindInstallationDetection();
        
        // Atualizar UI baseado no estado
        this.updateUI();
        
        // Solicitar persistência de armazenamento
        this.requestStoragePersistence();
        
        // Verificar diretório salvo (se disponível)
        this.checkSavedDirectory();
        
        // Mostrar botão se não estiver instalado (mesmo sem beforeinstallprompt)
        if (!this.isInstalled && this.installButton) {
            // Dar tempo para beforeinstallprompt disparar
            setTimeout(() => {
                if (!this.deferredPrompt && !this.isInstalled) {
                    console.log('⏰ beforeinstallprompt ainda não disparou após 1.5s');
                    console.log('📲 Mostrando botão de qualquer forma (Edge pode demorar)');
                    this.showInstallButton();
                    
                    // Adicionar dica visual no console
                    console.log('%c💡 DICA: No Edge, use Menu (⋯) → Aplicativos → Instalar este site como um aplicativo', 
                               'color: #667eea; font-weight: bold; font-size: 12px;');
                }
            }, 1500);
            
            // Segundo timeout mais longo para Edge
            setTimeout(() => {
                if (!this.deferredPrompt && !this.isInstalled) {
                    console.log('⏰ beforeinstallprompt não disparou após 5s');
                    console.log('📊 Status PWA:', this.getInstallInfo());
                }
            }, 5000);
        }
        
        // Log de informações PWA
        this.logPWAInfo();
    }
    
    /**
     * Verifica se o app já está instalado
     */
    checkIfInstalled() {
        // Verificar se está rodando como standalone
        if (window.matchMedia('(display-mode: standalone)').matches) {
            this.isStandalone = true;
            this.isInstalled = true;
            console.log('✅ PWA rodando em modo standalone');
        }
        
        // iOS Safari
        if (navigator.standalone === true) {
            this.isStandalone = true;
            this.isInstalled = true;
            console.log('✅ PWA instalado no iOS');
        }
        
        // Verificar pelo referrer
        if (document.referrer.includes('android-app://')) {
            this.isStandalone = true;
            this.isInstalled = true;
            console.log('✅ PWA instalado no Android');
        }
    }
    
    /**
     * Solicita persistência de armazenamento (evita limpeza automática)
     */
    async requestStoragePersistence() {
        if (!navigator.storage || !navigator.storage.persist) {
            console.warn('⚠️ navigator.storage.persist() não suportado');
            return;
        }
        
        try {
            // Verificar se já tem persistência
            const isPersisted = await navigator.storage.persisted();
            
            if (isPersisted) {
                console.log('✅ Armazenamento já está persistente');
                this.persistenceGranted = true;
                return;
            }
            
            // Solicitar persistência
            const granted = await navigator.storage.persist();
            this.persistenceGranted = granted;
            
            if (granted) {
                console.log('✅ Persistência de armazenamento concedida!');
                this.showToast('✅ Armazenamento seguro ativado', 'success');
            } else {
                console.warn('⚠️ Persistência de armazenamento negada');
            }
            
            // Verificar estimativa de storage
            await this.updateStorageEstimate();
            
        } catch (error) {
            console.error('❌ Erro ao solicitar persistência:', error);
        }
    }
    
    /**
     * Atualiza estimativa de armazenamento
     */
    async updateStorageEstimate() {
        if (!navigator.storage || !navigator.storage.estimate) {
            return null;
        }
        
        try {
            this.storageEstimate = await navigator.storage.estimate();
            
            const usedMB = (this.storageEstimate.usage / 1024 / 1024).toFixed(2);
            const quotaMB = (this.storageEstimate.quota / 1024 / 1024).toFixed(2);
            const percentUsed = ((this.storageEstimate.usage / this.storageEstimate.quota) * 100).toFixed(1);
            
            console.log(`💾 Armazenamento: ${usedMB} MB / ${quotaMB} MB (${percentUsed}%)`);
            
            return this.storageEstimate;
        } catch (error) {
            console.error('❌ Erro ao obter estimativa de storage:', error);
            return null;
        }
    }
    
    /**
     * Permite usuário escolher diretório local de instalação (File System Access API)
     */
    async selectInstallDirectory() {
        // Verificar suporte a File System Access API
        if (!('showDirectoryPicker' in window)) {
            console.warn('⚠️ File System Access API não suportada neste navegador');
            this.showToast('⚠️ Seleção de pasta não suportada neste navegador', 'warning');
            return null;
        }
        
        try {
            this.showToast('📂 Selecione onde deseja armazenar os dados do Terra MIDI', 'info');
            
            // Solicitar acesso ao diretório
            this.directoryHandle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'documents'
            });
            
            console.log('✅ Diretório selecionado:', this.directoryHandle.name);
            
            // Salvar referência do diretório no IndexedDB
            await this.saveDirectoryHandle();
            
            // Criar estrutura de pastas
            await this.createDirectoryStructure();
            
            this.showToast(`✅ Pasta "${this.directoryHandle.name}" configurada com sucesso!`, 'success');
            
            return this.directoryHandle;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('ℹ️ Usuário cancelou a seleção de diretório');
            } else {
                console.error('❌ Erro ao selecionar diretório:', error);
                this.showToast('❌ Erro ao selecionar pasta', 'error');
            }
            return null;
        }
    }
    
    /**
     * Salva referência do diretório no IndexedDB
     */
    async saveDirectoryHandle() {
        if (!this.directoryHandle) return;
        
        try {
            const db = await this.openIndexedDB();
            const tx = db.transaction('settings', 'readwrite');
            const store = tx.objectStore('settings');
            
            await store.put({
                key: 'directoryHandle',
                value: this.directoryHandle
            });
            
            console.log('✅ Referência do diretório salva no IndexedDB');
        } catch (error) {
            console.error('❌ Erro ao salvar diretório:', error);
        }
    }
    
    /**
     * Verifica e restaura diretório salvo
     */
    async checkSavedDirectory() {
        try {
            const db = await this.openIndexedDB();
            const tx = db.transaction('settings', 'readonly');
            const store = tx.objectStore('settings');
            const result = await store.get('directoryHandle');
            
            if (result && result.value) {
                this.directoryHandle = result.value;
                
                // Verificar permissão
                const permission = await this.directoryHandle.queryPermission({ mode: 'readwrite' });
                
                if (permission === 'granted') {
                    console.log('✅ Diretório restaurado:', this.directoryHandle.name);
                } else if (permission === 'prompt') {
                    // Solicitar permissão novamente
                    const newPermission = await this.directoryHandle.requestPermission({ mode: 'readwrite' });
                    if (newPermission === 'granted') {
                        console.log('✅ Permissão do diretório revalidada');
                    } else {
                        console.warn('⚠️ Permissão negada, diretório será descartado');
                        this.directoryHandle = null;
                    }
                } else {
                    this.directoryHandle = null;
                }
            }
        } catch (error) {
            console.warn('⚠️ Não foi possível restaurar diretório:', error);
            this.directoryHandle = null;
        }
    }
    
    /**
     * Cria estrutura de pastas no diretório selecionado
     */
    async createDirectoryStructure() {
        if (!this.directoryHandle) return;
        
        try {
            // Criar pastas principais
            const folders = ['soundfonts', 'presets', 'recordings', 'cache'];
            
            for (const folder of folders) {
                await this.directoryHandle.getDirectoryHandle(folder, { create: true });
                console.log(`📁 Pasta criada: ${folder}`);
            }
            
            // Criar arquivo de metadados
            const metadataFile = await this.directoryHandle.getFileHandle('terra-midi-metadata.json', { create: true });
            const writable = await metadataFile.createWritable();
            
            await writable.write(JSON.stringify({
                version: '1.0.0.0.0',
                createdAt: new Date().toISOString(),
                appName: 'Terra MIDI',
                folders: folders
            }, null, 2));
            
            await writable.close();
            
            console.log('✅ Estrutura de diretórios criada com sucesso');
            
        } catch (error) {
            console.error('❌ Erro ao criar estrutura de diretórios:', error);
        }
    }
    
    /**
     * Abre/cria banco IndexedDB para settings
     */
    openIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('TerraMidiSettings', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }
    
    /**
     * Bind do evento beforeinstallprompt
     */
    bindInstallPrompt() {
        // Capturar evento beforeinstallprompt
        window.addEventListener('beforeinstallprompt', (e) => {
            console.log('📲 beforeinstallprompt capturado!');
            
            // Prevenir mini-infobar do Chrome/Edge
            e.preventDefault();
            
            // Armazenar evento para usar depois
            this.deferredPrompt = e;
            
            // Mostrar botão de instalação imediatamente
            this.showInstallButton();
            
            console.log('📲 Prompt de instalação está pronto e botão exibido');
        });
        
        // Listener do botão - registrar IMEDIATAMENTE
        if (this.installButton) {
            this.installButton.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('🖱️ Clique no botão de instalação detectado');
                this.promptInstall();
            });
            console.log('✅ Listener do botão de instalação registrado');
        } else {
            console.error('❌ Botão #btn-install-pwa não encontrado no DOM!');
        }
    }
    
    /**
     * Detecta quando o app foi instalado
     */
    bindInstallationDetection() {
        window.addEventListener('appinstalled', (e) => {
            console.log('✅ PWA instalado com sucesso!');
            
            this.isInstalled = true;
            this.deferredPrompt = null;
            
            // Ocultar botão de instalação
            this.hideInstallButton();
            
            // Notificar usuário
            this.showInstallSuccessMessage();
            
            // Analytics (se disponível)
            if (typeof gtag !== 'undefined') {
                gtag('event', 'pwa_installed', {
                    event_category: 'engagement',
                    event_label: 'PWA Installation'
                });
            }
        });
    }
    
    /**
     * Mostra botão de instalação
     */
    showInstallButton() {
        if (this.installButton && !this.isInstalled) {
            this.installButton.style.display = 'inline-flex';
            console.log('📲 Botão de instalação exibido');
        }
    }
    
    /**
     * Oculta botão de instalação
     */
    hideInstallButton() {
        if (this.installButton) {
            this.installButton.style.display = 'none';
        }
    }
    
    /**
     * Exibe prompt de instalação
     */
    async promptInstall() {
        // Se temos o prompt diferido, usar ele
        if (this.deferredPrompt) {
            try {
                console.log('📲 Exibindo prompt de instalação...');
                
                // Mostrar feedback "Instalando..."
                this.showInstallModal('installing');
                
                // Mostrar prompt
                this.deferredPrompt.prompt();
                
                // Aguardar escolha do usuário
                const { outcome } = await this.deferredPrompt.userChoice;
                
                console.log(`📲 Usuário ${outcome === 'accepted' ? 'aceitou' : 'recusou'} a instalação`);
                
                if (outcome === 'accepted') {
                    // Instalação aceita
                    this.showInstallModal('success');
                    this.hideInstallButton();
                    
                    // Perguntar se deseja escolher diretório
                    setTimeout(() => {
                        this.offerDirectorySelection();
                    }, 2000);
                } else {
                    // Instalação recusada
                    this.showInstallModal('cancelled');
                }
                
                // Limpar prompt usado
                this.deferredPrompt = null;
                
            } catch (error) {
                console.error('❌ Erro ao exibir prompt de instalação:', error);
                this.showInstallModal('error', error.message);
                this.showInstallInstructions();
            }
            return;
        }
        
        // Se não temos prompt, tentar API de relacionamento (Edge/Chrome)
        if ('getInstalledRelatedApps' in navigator) {
            try {
                const relatedApps = await navigator.getInstalledRelatedApps();
                if (relatedApps.length > 0) {
                    console.log('✅ App já está instalado');
                    this.isInstalled = true;
                    this.hideInstallButton();
                    this.showToast('O Terra MIDI já está instalado! 🎉', 'success');
                    return;
                }
            } catch (error) {
                console.warn('⚠️ Não foi possível verificar apps instalados:', error);
            }
        }
        
        // Fallback: mostrar instruções baseadas no navegador
        console.warn('⚠️ Prompt de instalação não disponível, mostrando instruções');
        this.showInstallInstructions();
    }
    
    /**
     * Oferece seleção de diretório após instalação
     */
    async offerDirectorySelection() {
        if (!('showDirectoryPicker' in window)) {
            console.log('ℹ️ File System Access API não disponível');
            return;
        }
        
        // Criar modal customizado
        const modal = this.createCustomModal(
            '📂 Escolher pasta de armazenamento',
            'Deseja escolher uma pasta para armazenar os dados do Terra MIDI? (Opcional)',
            [
                {
                    text: '📂 Escolher Pasta',
                    className: 'btn-primary',
                    onClick: () => {
                        this.selectInstallDirectory();
                        this.closeCustomModal();
                    }
                },
                {
                    text: 'Agora não',
                    className: 'btn-secondary',
                    onClick: () => {
                        this.closeCustomModal();
                        this.showToast('Você pode escolher a pasta depois nas configurações', 'info');
                    }
                }
            ]
        );
        
        document.body.appendChild(modal);
    }
    
    /**
     * Mostra instruções de instalação manual
     */
    showInstallInstructions() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/.test(navigator.userAgent);
        const isEdge = /Edg/.test(navigator.userAgent);
        const isChrome = /Chrome/.test(navigator.userAgent) && !isEdge;
        
        let message = '📲 Como instalar o Terra MIDI:\n\n';
        
        if (isIOS) {
            message += '📱 Safari iOS:\n';
            message += '1. Toque no botão Compartilhar (⬆️)\n';
            message += '2. Role para baixo e toque em "Adicionar à Tela de Início"\n';
            message += '3. Toque em "Adicionar"';
        } else if (isAndroid) {
            message += '📱 Chrome Android:\n';
            message += '1. Toque no menu (⋮) no canto superior direito\n';
            message += '2. Selecione "Instalar aplicativo" ou "Adicionar à tela inicial"\n';
            message += '3. Confirme a instalação';
        } else if (isEdge) {
            message += '💻 Microsoft Edge:\n\n';
            message += '1. Clique no menu (⋯) no canto superior direito\n';
            message += '2. Selecione "Aplicativos" ou "Apps"\n';
            message += '3. Clique em "Instalar este site como um aplicativo"\n';
            message += '4. Confirme clicando em "Instalar"\n\n';
            message += 'OU procure o ícone de instalação (⊕) na barra de endereço';
        } else if (isChrome) {
            message += '💻 Google Chrome:\n\n';
            message += '1. Clique no menu (⋮) no canto superior direito\n';
            message += '2. Selecione "Instalar Terra MIDI..."\n';
            message += '3. Confirme clicando em "Instalar"\n\n';
            message += 'OU procure o ícone de instalação (⊕) na barra de endereço';
        } else {
            message += '💻 Desktop:\n';
            message += 'Chrome: Menu (⋮) → Instalar Terra MIDI\n';
            message += 'Edge: Menu (⋯) → Aplicativos → Instalar este site como um aplicativo\n';
            message += 'Opera: Ícone de instalação na barra de endereço';
        }
        
        // Usar sistema de notificação se disponível
        if (typeof window.midiNotifier !== 'undefined' && window.midiNotifier.showInfo) {
            window.midiNotifier.showInfo(message);
        } else {
            alert(message);
        }
        
        console.log(message);
    }
    
    /**
     * Mensagem de sucesso após instalação
     */
    showInstallSuccessMessage() {
        const message = '🎉 Terra MIDI instalado com sucesso!\n\nVocê pode abrir o app a partir da tela inicial.';
        
        if (typeof window.midiNotifier !== 'undefined' && window.midiNotifier.showInfo) {
            window.midiNotifier.showInfo(message);
        } else {
            alert(message);
        }
    }
    
    /**
     * Atualiza UI baseado no estado de instalação
     */
    updateUI() {
        // Adicionar classe ao body se estiver instalado
        if (this.isStandalone) {
            document.body.classList.add('pwa-standalone');
            console.log('✅ Classe pwa-standalone adicionada ao body');
        }
        
        // Ocultar botão se já estiver instalado
        if (this.isInstalled) {
            this.hideInstallButton();
        }
    }
    
    /**
     * Log de informações PWA
     */
    logPWAInfo() {
        console.log('═══════════════════════════════════════════════════════════');
        console.log('📲 INFORMAÇÕES PWA - TERRA MIDI');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('✓ Instalado:', this.isInstalled);
        console.log('✓ Modo standalone:', this.isStandalone);
        console.log('✓ Service Worker:', 'serviceWorker' in navigator);
        console.log('✓ beforeinstallprompt:', this.deferredPrompt !== null);
        console.log('✓ Display mode:', this.getDisplayMode());
        console.log('✓ Plataforma:', this.getPlatform());
        console.log('═══════════════════════════════════════════════════════════');
    }
    
    /**
     * Detecta modo de exibição atual
     */
    getDisplayMode() {
        const modes = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];
        
        for (const mode of modes) {
            if (window.matchMedia(`(display-mode: ${mode})`).matches) {
                return mode;
            }
        }
        
        return 'unknown';
    }
    
    /**
     * Detecta plataforma
     */
    getPlatform() {
        const ua = navigator.userAgent;
        
        if (/iPad|iPhone|iPod/.test(ua)) return 'iOS';
        if (/Android/.test(ua)) return 'Android';
        if (/Windows/.test(ua)) return 'Windows';
        if (/Mac/.test(ua)) return 'macOS';
        if (/Linux/.test(ua)) return 'Linux';
        
        return 'Unknown';
    }
    
    /**
     * Verifica se pode ser instalado
     */
    canInstall() {
        return (
            !this.isInstalled &&
            (this.deferredPrompt !== null || this.canInstallManually())
        );
    }
    
    /**
     * Verifica se pode ser instalado manualmente
     */
    canInstallManually() {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isStandalone = navigator.standalone === true;
        
        return isIOS && !isStandalone;
    }
    
    /**
     * Obtém informações de instalação
     */
    getInstallInfo() {
        return {
            isInstalled: this.isInstalled,
            isStandalone: this.isStandalone,
            canInstall: this.canInstall(),
            displayMode: this.getDisplayMode(),
            platform: this.getPlatform(),
            hasDirectoryAccess: this.directoryHandle !== null,
            storageEstimate: this.storageEstimate,
            persistenceGranted: this.persistenceGranted
        };
    }
    
    /**
     * Mostra toast notification
     */
    showToast(message, type = 'info') {
        // Remover toast anterior se existir
        const existingToast = document.querySelector('.pwa-toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        const toast = document.createElement('div');
        toast.className = `pwa-toast pwa-toast-${type}`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'polite');
        
        const icon = {
            'success': '✅',
            'error': '❌',
            'warning': '⚠️',
            'info': 'ℹ️'
        }[type] || 'ℹ️';
        
        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" aria-label="Fechar">×</button>
        `;
        
        document.body.appendChild(toast);
        
        // Animar entrada
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Fechar ao clicar
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        });
        
        // Auto-fechar após 5 segundos
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }
        }, 5000);
    }
    
    /**
     * Mostra modal de instalação
     */
    showInstallModal(state, errorMessage = '') {
        // Remover modal anterior
        const existingModal = document.querySelector('.pwa-install-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        const modal = document.createElement('div');
        modal.className = 'pwa-install-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        
        let content = '';
        
        switch (state) {
            case 'installing':
                content = `
                    <div class="modal-content modal-installing">
                        <div class="spinner"></div>
                        <h3>Instalando Terra MIDI...</h3>
                        <p>Aguarde enquanto o aplicativo é instalado</p>
                    </div>
                `;
                break;
                
            case 'success':
                content = `
                    <div class="modal-content modal-success">
                        <div class="success-icon">🎉</div>
                        <h3>Instalado com sucesso!</h3>
                        <p>O Terra MIDI foi instalado e está pronto para uso</p>
                        <button class="btn-close-modal">Começar a usar</button>
                    </div>
                `;
                break;
                
            case 'error':
                content = `
                    <div class="modal-content modal-error">
                        <div class="error-icon">❌</div>
                        <h3>Erro na instalação</h3>
                        <p>${errorMessage || 'Ocorreu um erro durante a instalação'}</p>
                        <button class="btn-close-modal">Tentar novamente</button>
                    </div>
                `;
                break;
                
            case 'cancelled':
                content = `
                    <div class="modal-content modal-cancelled">
                        <div class="info-icon">ℹ️</div>
                        <h3>Instalação cancelada</h3>
                        <p>Você pode instalar o Terra MIDI a qualquer momento</p>
                        <button class="btn-close-modal">OK</button>
                    </div>
                `;
                break;
        }
        
        modal.innerHTML = content;
        document.body.appendChild(modal);
        
        // Animar entrada
        setTimeout(() => modal.classList.add('show'), 10);
        
        // Fechar modal
        const closeBtn = modal.querySelector('.btn-close-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('show');
                setTimeout(() => modal.remove(), 300);
            });
        }
        
        // Auto-fechar após alguns segundos (exceto installing)
        if (state !== 'installing') {
            setTimeout(() => {
                if (modal.parentElement) {
                    modal.classList.remove('show');
                    setTimeout(() => modal.remove(), 300);
                }
            }, 4000);
        }
    }
    
    /**
     * Cria modal customizado
     */
    createCustomModal(title, message, buttons = []) {
        const modal = document.createElement('div');
        modal.className = 'pwa-custom-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        
        const buttonsHTML = buttons.map(btn => 
            `<button class="${btn.className}" data-action="${btn.text}">${btn.text}</button>`
        ).join('');
        
        modal.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="modal-buttons">
                    ${buttonsHTML}
                </div>
            </div>
        `;
        
        // Bind eventos dos botões
        buttons.forEach((btn, index) => {
            const btnElement = modal.querySelectorAll('.modal-buttons button')[index];
            if (btnElement && btn.onClick) {
                btnElement.addEventListener('click', btn.onClick);
            }
        });
        
        // Fechar ao clicar no overlay
        const overlay = modal.querySelector('.modal-overlay');
        overlay.addEventListener('click', () => {
            this.closeCustomModal();
        });
        
        // Animar entrada
        setTimeout(() => modal.classList.add('show'), 10);
        
        return modal;
    }
    
    /**
     * Fecha modal customizado
     */
    closeCustomModal() {
        const modal = document.querySelector('.pwa-custom-modal');
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 300);
        }
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.PWAInstaller = PWAInstaller;
    
    // Instanciar automaticamente quando DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.pwaInstaller = new PWAInstaller();
        });
    } else {
        window.pwaInstaller = new PWAInstaller();
    }
}
