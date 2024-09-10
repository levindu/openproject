import * as Turbo from '@hotwired/turbo';
import { Controller } from '@hotwired/stimulus';
import {
  ICKEditorInstance,
} from 'core-app/shared/components/editor/components/ckeditor/ckeditor.types';

interface CustomEventWithIdParam extends Event {
  params:{
    id:string;
  };
}

export default class IndexController extends Controller {
  static values = {
    updateStreamsUrl: String,
    sorting: String,
    pollingIntervalInMs: Number,
    filter: String,
    userId: Number,
    workPackageId: Number,
  };

  static targets = ['journalsContainer', 'buttonRow', 'formRow', 'form'];

  declare readonly journalsContainerTarget:HTMLElement;
  declare readonly buttonRowTarget:HTMLInputElement;
  declare readonly formRowTarget:HTMLElement;
  declare readonly formTarget:HTMLFormElement;

  declare updateStreamsUrlValue:string;
  declare sortingValue:string;
  declare lastUpdateTimestamp:string;
  declare intervallId:number;
  declare pollingIntervalInMsValue:number;
  declare filterValue:string;
  declare userIdValue:number;
  declare workPackageIdValue:number;
  declare localStorageKey:string;

  private handleWorkPackageUpdateBound:EventListener;
  private handleVisibilityChangeBound:EventListener;
  private rescueEditorContentBound:EventListener;

  private onSubmitBound:EventListener;
  private adjustMarginBound:EventListener;
  private hideEditorBound:EventListener;

  connect() {
    this.setLocalStorageKey();
    this.setLastUpdateTimestamp();
    this.setupEventListeners();
    this.handleInitialScroll();
    this.startPolling();
    this.populateRescuedEditorContent();
  }

  disconnect() {
    this.rescueEditorContent();
    this.removeEventListeners();
    this.stopPolling();
  }

  private setLocalStorageKey() {
    // scoped by user id in order to avoid data leakage when a user logs out and another user logs in on the same browser
    // TODO: when a user logs out, the data should be removed anyways in order to avoid data leakage
    this.localStorageKey = `work-package-${this.workPackageIdValue}-rescued-editor-data-${this.userIdValue}`;
  }

  private setupEventListeners() {
    this.handleWorkPackageUpdateBound = () => { void this.handleWorkPackageUpdate(); };
    this.handleVisibilityChangeBound = () => { void this.handleVisibilityChange(); };
    this.rescueEditorContentBound = () => { void this.rescueEditorContent(); };

    document.addEventListener('work-package-updated', this.handleWorkPackageUpdateBound);
    document.addEventListener('visibilitychange', this.handleVisibilityChangeBound);
    document.addEventListener('beforeunload', this.rescueEditorContentBound);
  }

  private removeEventListeners() {
    document.removeEventListener('work-package-updated', this.handleWorkPackageUpdateBound);
    document.removeEventListener('visibilitychange', this.handleVisibilityChangeBound);
    document.removeEventListener('beforeunload', this.rescueEditorContentBound);
  }

  private handleVisibilityChange() {
    if (document.hidden) {
      this.stopPolling();
    } else {
      void this.updateActivitiesList();
      this.startPolling();
    }
  }

  private startPolling() {
    if (this.intervallId) window.clearInterval(this.intervallId);
    this.intervallId = this.pollForUpdates();
  }

  private stopPolling() {
    window.clearInterval(this.intervallId);
  }

  private pollForUpdates() {
    return window.setInterval(() => this.updateActivitiesList(), this.pollingIntervalInMsValue);
  }

  handleWorkPackageUpdate(_event?:Event):void {
    setTimeout(() => this.updateActivitiesList(), 2000);
  }

  async updateActivitiesList() {
    const journalsContainerAtBottom = this.isJournalsContainerScrolledToBottom(this.journalsContainerTarget);
    const url = new URL(this.updateStreamsUrlValue);
    url.searchParams.append('last_update_timestamp', this.lastUpdateTimestamp);
    url.searchParams.append('filter', this.filterValue);

    const response = await this.fetchWithCSRF(url, 'GET');

    if (response.ok) {
      const text = await response.text();
      Turbo.renderStreamMessage(text);
      this.setLastUpdateTimestamp();
      setTimeout(() => {
        if (this.sortingValue === 'asc' && journalsContainerAtBottom) {
          // scroll to (new) bottom if sorting is ascending and journals container was already at bottom before a new activity was added
          if (this.isMobile()) {
            this.scrollInputContainerIntoView(300);
          } else {
            this.scrollJournalContainer(this.journalsContainerTarget, true);
          }
        }
      }, 100);
    }
  }

  private rescueEditorContent() {
    const ckEditorInstance = this.getCkEditorInstance();
    if (ckEditorInstance) {
      const data = ckEditorInstance.getData({ trim: false });
      if (data.length > 0) {
        localStorage.setItem(this.localStorageKey, data);
      }
    }
  }

  private populateRescuedEditorContent() {
    const rescuedEditorContent = localStorage.getItem(this.localStorageKey);
    if (rescuedEditorContent) {
      this.openEditorWithInitialData(rescuedEditorContent);
      localStorage.removeItem(this.localStorageKey);
    }
  }

  private handleInitialScroll() {
    if (window.location.hash.includes('#activity-')) {
      const activityId = window.location.hash.replace('#activity-', '');
      this.scrollToActivity(activityId);
    } else if (this.sortingValue === 'asc') {
      this.scrollToBottom();
    }
  }

  private scrollToActivity(activityId:string) {
    const scrollableContainer = jQuery(this.element).scrollParent()[0];
    const activityElement = document.getElementById(`activity-anchor-${activityId}`);

    if (activityElement && scrollableContainer) {
      scrollableContainer.scrollTop = activityElement.offsetTop-70;
    }
  }

  private scrollToBottom() {
    const scrollableContainer = jQuery(this.element).scrollParent()[0];
    if (scrollableContainer) {
      scrollableContainer.scrollTop = scrollableContainer.scrollHeight;
    }
  }

  setFilterToOnlyComments() { this.filterValue = 'only_comments'; }
  setFilterToOnlyChanges() { this.filterValue = 'only_changes'; }
  unsetFilter() { this.filterValue = ''; }

  setAnchor(event:CustomEventWithIdParam) {
    // native anchor scroll is causing positioning issues
    event.preventDefault();
    const activityId = event.params.id;

    this.scrollToActivity(activityId);
    window.location.hash = `#activity-${activityId}`;
  }

  private getCkEditorElement():HTMLElement | null {
    return this.element.querySelector('opce-ckeditor-augmented-textarea');
  }

  private getCkEditorInstance():ICKEditorInstance | null {
    const AngularCkEditorElement = this.getCkEditorElement();
    return AngularCkEditorElement ? jQuery(AngularCkEditorElement).data('editor') as ICKEditorInstance : null;
  }

  private getInputContainer():HTMLElement | null {
    return this.element.querySelector('#work-package-journal-form-element');
  }

  // TODO: get rid of static width value and reach for a more CSS based solution
  private isMobile():boolean {
    return window.innerWidth < 1279;
  }

  // TODO: get rid of static width value and reach for a more CSS based solution
  private isSmViewPort():boolean {
    return window.innerWidth < 543;
  }

  // TODO: get rid of static width value and reach for a more CSS based solution
  private isMdViewPort():boolean {
    return window.innerWidth >= 543 && window.innerWidth < 1279;
  }

  private addEventListenersToCkEditorInstance() {
    this.onSubmitBound = () => { void this.onSubmit(); };
    this.adjustMarginBound = () => { void this.adjustJournalContainerMargin(); };
    this.hideEditorBound = () => { void this.hideEditorIfEmpty(); };

    const editorElement = this.getCkEditorElement();
    if (editorElement) {
      editorElement.addEventListener('saveRequested', this.onSubmitBound);
      editorElement.addEventListener('editorKeyup', this.adjustMarginBound);
      editorElement.addEventListener('editorBlur', this.hideEditorBound);
    }
  }

  private removeEventListenersFromCkEditorInstance() {
    const editorElement = this.getCkEditorElement();
    if (editorElement) {
      editorElement.removeEventListener('saveRequested', this.onSubmitBound);
      editorElement.removeEventListener('editorKeyup', this.adjustMarginBound);
      editorElement.removeEventListener('editorBlur', this.hideEditorBound);
    }
  }

  private adjustJournalContainerMargin() {
    // don't do this on mobile screens
    if (this.isMobile()) { return; }
    this.journalsContainerTarget.style.marginBottom = `${this.formRowTarget.clientHeight + 33}px`;
  }

  private isJournalsContainerScrolledToBottom(journalsContainer:HTMLElement) {
    let atBottom = false;
    // we have to handle different scrollable containers for different viewports in order to idenfity if the user is at the bottom of the journals
    // seems way to hacky for me, but I couldn't find a better solution
    if (this.isSmViewPort()) {
      atBottom = (window.scrollY + window.outerHeight + 10) >= document.body.scrollHeight;
    } else if (this.isMdViewPort()) {
      const scrollableContainer = document.querySelector('#content-body') as HTMLElement;

      atBottom = (scrollableContainer.scrollTop + scrollableContainer.clientHeight + 10) >= scrollableContainer.scrollHeight;
    } else {
      const scrollableContainer = jQuery(journalsContainer).scrollParent()[0];

      atBottom = (scrollableContainer.scrollTop + scrollableContainer.clientHeight + 10) >= scrollableContainer.scrollHeight;
    }

    return atBottom;
  }

  private scrollJournalContainer(journalsContainer:HTMLElement, toBottom:boolean) {
    const scrollableContainer = jQuery(journalsContainer).scrollParent()[0];
    if (scrollableContainer) {
      scrollableContainer.scrollTop = toBottom ? scrollableContainer.scrollHeight : 0;
    }
  }

  private scrollInputContainerIntoView(timeout:number = 0) {
    const inputContainer = this.getInputContainer() as HTMLElement;
    setTimeout(() => {
      if (inputContainer) {
        inputContainer.scrollIntoView({ behavior: 'smooth' });
      }
    }, timeout);
  }

  showForm() {
    const journalsContainerAtBottom = this.isJournalsContainerScrolledToBottom(this.journalsContainerTarget);

    this.buttonRowTarget.classList.add('d-none');
    this.formRowTarget.classList.remove('d-none');
    this.journalsContainerTarget?.classList.add('work-packages-activities-tab-index-component--journals-container_with-input-compensation');

    this.addEventListenersToCkEditorInstance();

    if (this.isMobile()) {
      this.scrollInputContainerIntoView(300);
    } else if (this.sortingValue === 'asc' && journalsContainerAtBottom) {
      // scroll to (new) bottom if sorting is ascending and journals container was already at bottom before showing the form
      this.scrollJournalContainer(this.journalsContainerTarget, true);
    }

    const ckEditorInstance = this.getCkEditorInstance();
    if (ckEditorInstance) {
      setTimeout(() => ckEditorInstance.editing.view.focus(), 10);
    }
  }

  focusEditor() {
    const ckEditorInstance = this.getCkEditorInstance();
    if (ckEditorInstance) {
      setTimeout(() => ckEditorInstance.editing.view.focus(), 10);
    }
  }

  quote(event:Event) {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    const userName = target.dataset.userNameParam as string;
    const content = target.dataset.contentParam as string;

    this.openEditorWithInitialData(this.quotedText(content, userName));
  }

  private quotedText(rawComment:string, userName:string) {
    const quoted = rawComment.split('\n')
      .map((line:string) => `\n> ${line}`)
      .join('');

    return `${userName}\n${quoted}`;
  }

  openEditorWithInitialData(quotedText:string) {
    this.showForm();
    const ckEditorInstance = this.getCkEditorInstance();
    if (ckEditorInstance && ckEditorInstance.getData({ trim: false }).length === 0) {
      ckEditorInstance.setData(quotedText);
    }
  }

  clearEditor() {
    this.getCkEditorInstance()?.setData('');
  }

  hideEditorIfEmpty() {
    const ckEditorInstance = this.getCkEditorInstance();

    if (ckEditorInstance && ckEditorInstance.getData({ trim: false }).length === 0) {
      this.clearEditor(); // remove potentially empty lines
      this.removeEventListenersFromCkEditorInstance();
      this.buttonRowTarget.classList.remove('d-none');
      this.formRowTarget.classList.add('d-none');

      if (this.journalsContainerTarget) {
        this.journalsContainerTarget.style.marginBottom = '';
        this.journalsContainerTarget.classList.add('work-packages-activities-tab-index-component--journals-container_with-initial-input-compensation');
        this.journalsContainerTarget.classList.remove('work-packages-activities-tab-index-component--journals-container_with-input-compensation');
      }

      if (this.isMobile()) { this.scrollInputContainerIntoView(300); }
    }
  }

  async onSubmit(event:Event | null = null) {
    event?.preventDefault();
    const ckEditorInstance = this.getCkEditorInstance();
    const data = ckEditorInstance ? ckEditorInstance.getData({ trim: false }) : '';

    const formData = new FormData(this.formTarget);
    formData.append('last_update_timestamp', this.lastUpdateTimestamp);
    formData.append('filter', this.filterValue);
    formData.append('journal[notes]', data);

    const response = await this.fetchWithCSRF(this.formTarget.action, 'POST', formData);

    if (response.ok) {
      this.setLastUpdateTimestamp();
      const text = await response.text();
      Turbo.renderStreamMessage(text);

      if (this.journalsContainerTarget) {
        this.clearEditor();
        if (this.isMobile()) {
          this.hideEditorIfEmpty();
        } else {
          this.focusEditor();
        }
        if (this.journalsContainerTarget) {
          this.journalsContainerTarget.style.marginBottom = '';
          this.journalsContainerTarget.classList.add('work-packages-activities-tab-index-component--journals-container_with-input-compensation');
        }
        setTimeout(() => {
          this.scrollJournalContainer(
            this.journalsContainerTarget,
            this.sortingValue === 'asc',
          );
          if (this.isMobile()) {
            this.scrollInputContainerIntoView(300);
          }
        }, 10);
      }
    }
  }

  private async fetchWithCSRF(url:string | URL, method:string, body?:FormData) {
    return fetch(url, {
      method,
      body,
      headers: {
        'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement).content,
        Accept: 'text/vnd.turbo-stream.html',
      },
      credentials: 'same-origin',
    });
  }

  setLastUpdateTimestamp() {
    this.lastUpdateTimestamp = new Date().toISOString();
  }
}
