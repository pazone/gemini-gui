/*jshint browser:true*/
'use strict';

var SectionList = require('./section-list'),
    xhr = require('./xhr'),
    byId = document.getElementById.bind(document);

function Controller() {
    this._sections = new SectionList(this);
    this._runButton = byId('run');
    this._retryButton = byId('retryFailed');

    this._handleButtonClicks();
    this._listenForEvents();

    this._retryButton.disabled = true;
}

Controller.prototype = {
    retryState: function(state) {
        this._performRetry(state);
    },

    _run: function() {
        var _this = this;

        this._toggleButtons(false);
        xhr.post('/run', function(error, data) {
            if (!error) {
                _this._sections.markAllAsQueued();
            }
        });
    },

    _retryAllFailed: function() {
        this._performRetry(this._sections.findFailedStates());
    },

    _performRetry: function(failed) {
        var _this = this;

        this._toggleButtons(false);

        xhr.post('/retry', failed, function(error, data) {
            if (!error) {
                _this._sections.markAsQueued(failed);
            }
        });
    },

    _toggleButtons: function(isEnabled) {
        this._runButton.disabled = !isEnabled;
        this._retryButton.disabled = !isEnabled;

        this._sections.toggleRetry(isEnabled);
    },

    _handleButtonClicks: function() {
        byId('expandAll').addEventListener('click', this._sections.expandAll.bind(this._sections));
        byId('collapseAll').addEventListener('click', this._sections.collapseAll.bind(this._sections));
        byId('expandErrors').addEventListener('click', this._sections.expandErrors.bind(this._sections));

        this._runButton.addEventListener('click', this._run.bind(this));
        this._retryButton.addEventListener('click', this._retryAllFailed.bind(this));
    },

    _listenForEvents: function() {
        var eventSource = new EventSource('/events'),
            _this = this;

        eventSource.addEventListener('beginSuite', function(e) {
            var data = JSON.parse(e.data),
                section = _this._sections.findSection({suite: data.suite});

            if (section && section.status === 'queued') {
                section.status = 'running';
            }
        });

        eventSource.addEventListener('beginState', function(e) {
            var data = JSON.parse(e.data),
                section = _this._sections.findSection({
                    suite: data.suite,
                    state: data.state
                });

            if (section && section.status === 'queued') {
                section.status = 'running';
            }
        });

        eventSource.addEventListener('endTest', function(e) {
            var data = JSON.parse(e.data),
                section = _this._sections.findSection({
                    suite: data.suite,
                    state: data.state,
                    browserId: data.browserId
                });

            if (data.equal) {
                section.setAsSuccess(data);
            } else {
                section.setAsFailure(data);
                section.expand();
                _this._sections.markBranchFailed(section);
            }
        });

        eventSource.addEventListener('skipState', function(e) {
            var data = JSON.parse(e.data),
                section = _this._sections.findSection({
                    suite: data.suite,
                    state: data.state,
                    browserId: data.browserId
                });
            section.setAsSkipped();
            var stateSection = _this._sections.findSection({
                suite: data.suite,
                state: data.state
            });

            _this._sections.markIfFinished(stateSection);
        });

        eventSource.addEventListener('error', function(e) {
            var data = JSON.parse(e.data),
                section = _this._sections.findSection({
                    suite: data.suite,
                    state: data.state,
                    browserId: data.browserId
                });
            section.setAsError({stack: data.stack});
            section.expand();
            _this._sections.markBranchFailed(section);
        });

        eventSource.addEventListener('endState', function(e) {
            var data = JSON.parse(e.data),
                section = _this._sections.findSection({
                    suite: data.suite,
                    state: data.state
                });

            _this._sections.markIfFinished(section);
        });

        eventSource.addEventListener('endSuite', function(e) {
            var data = JSON.parse(e.data),
                section = _this._sections.findSection({
                    suite: data.suite,
                    state: data.state,
                    browserId: data.browserId
                });

            _this._sections.markIfFinished(section);
        });

        eventSource.addEventListener('end', function(e) {
            _this._toggleButtons(true);
        });
    }
};

module.exports = Controller;
