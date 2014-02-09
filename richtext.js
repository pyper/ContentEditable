/**
* Class files for normalizing rich text editing in "A-Grade" browsers.
*
* Christopher Pyper 2007
*
**/

var ELEMENT_NODE                = 1;
var ATTRIBUTE_NODE              = 2;
var TEXT_NODE                   = 3;
var CDATA_SECTION_NODE          = 4;
var ENTITY_REFERENCE_NODE       = 5;
var ENTITY_NODE                 = 6;
var PROCESSING_INSTRUCTION_NODE = 7;
var COMMENT_NODE                = 8;
var DOCUMENT_NODE               = 9;
var DOCUMENT_TYPE_NODE          = 10;
var DOCUMENT_FRAGMENT_NODE      = 11;
var NOTATION_NODE               = 12;

// Convert color to RGB form
function convertColor(v)
{
    // Returns the hex representation of one byte (2 digits)
    function hex(d) {
        return (d < 16) ? ("0" + d.toString(16)) : d.toString(16);
    };

    if (typeof v == "number") {
        var r = v & 0xFF;
        var g = (v >> 8) & 0xFF;
        var b = (v >> 16) & 0xFF;
        return "#" + hex(r) + hex(g) + hex(b);
    }

    if (v.substr(0, 3) == "rgb") {
        var re = /rgb\s*\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*\)/;
        if (v.match(re)) {
            var r = parseInt(RegExp.$1);
            var g = parseInt(RegExp.$2);
            var b = parseInt(RegExp.$3);
            return "#" + hex(r) + hex(g) + hex(b);
        }
        return null;
    }

    if (v.substr(0, 1) == "#") {
        return v;
    }

    return null;
};

// Launch window if not existing and add message
function debug(message, level)
{
    console.log(message);
}

/**
* Class EditableBase
*
* Base class for browser specific rich text editing classes
**/
var EditableBase = function()
{
    // Document object reference of document containing edited node
    this.doc = null;
    
    // Reference to node being edited
    this.node = null;
    
    // Array holding last validated commands, used to compare and signal a change
    this.cachedCommandArray = null;
    
    // Function reference of function to call if command state changes
    this.stateChangeCallback = null;
    
    // Commands to check for when checking context
    this.commands = [
                        ['bold', 'state'],
                        ['italic', 'state'],
                        ['underline', 'state'],
                        ['fontname', 'value'],
                        ['fontsize', 'value'],
                        ['forecolor', 'value']
                    ];

    // Constructor
    this.EditableBase = function(){};
    
    // Overridden in sub class to define browser specific functionality for turning on editing of node
    this.editableOn = function(node)
    {
        if(!this.checkNodeType(node))
            return false;
        debug("editableOn() : Node was not made editable, no browser specific method overridden");
        return false;
    };
    
    // Overridden in sub class to define browser specific functionality for turning off editing of node
    this.editableOff = function()
    {
        debug("editableOff() : Node was not made uneditable, no browser specific method overridden");
        return false;
    };
    
    // Check that it is the correct node type for editing
    this.checkNodeType = function(node)
    {
        // Make sure it is a element node
        if(node && node.nodeType && ELEMENT_NODE == node.nodeType)
            return true;
        debug("checkNodeType() : Incorrect element type");
        return false;
    };  
    
    // Exec a command
    this.execCommand = function(command)
    {
        if(!this.doc)
            return false;
            
        // Call any function pre-exec functionality, such as re-selecting a range
        this.preExecCommand();
        
        // Exec a command using defined document object
        var ret = this.doc.execCommand(command, false, false);
        
        // Call any function pre-exec functionality, such as updating a selection range
        this.postExecCommand()
        
        // Check if command state has changed
        this.checkCommandState();
        
        return ret;
    };
    
    // Overridden in sub class to define any browser specific pre-exec command functionality, such as re-selecting a range
    this.preExecCommand = function(){};
    
    // Overridden in sub class to define any browser specific post-exec command functionality, such as updating a selection range
    this.postExecCommand = function(){};
        
    // Set callback function for command state change callback
    this.setStateChangeCallBack = function(callBack)
    {
        this.stateChangeCallback = callBack;
    };
    
    // Get the current command state array of selection or cursor using the defined associative array
    this.getCommandState = function()
    {
        if(!this.doc || !this.node)
            return false;
                    
        var commandArray = new Array();
            
        for(var i in this.commands)
        {
            var command = this.commands[i][0];
            var type    = this.commands[i][1];
                
            // Get value or state depending on command
            if(type == 'state')
                commandArray[command] = this.doc.queryCommandState(command);
            else if(type == 'value')
                commandArray[command] = this.doc.queryCommandValue(command);
            else
                commandArray[command] = false;
                
            // Convert color to a nice Hex Representation, IE gives a number, Mozilla gives rgb(etc...  
            if(command && command.search(/color/) >= 0 && commandArray[command])
                commandArray[command] = convertColor(commandArray[command]);
    
            debug('getCommandState() command=' + command + " state/value=" + commandArray[command], 'info');
        }
        return commandArray;
    };
    
    // Fetch current command state compare against cached one, if diffrent send signal and cache new one
    this.checkCommandState = function()
    {
        debug('checkCommandState()');

        var commandArray = this.getCommandState();
        var makeCallback = false;
    
        // If you have an array of previous command states cached check against it
        if(this.cachedCommandArray)
        {
            for(var i in this.cachedCommandArray)
            {
                if(this.cachedCommandArray[i] != this.commandArray[i])
                {
                    debug('checkCommandState() - Command Change');
                    makeCallback = true;
                }
            }
        }
        else
            makeCallback = true;
    
        // Signal if there is a change
        if(makeCallback && this.stateChangeCallback)
        {
            this.cachedCommandArray = commandArray;
            this.stateChangeCallback(this.cachedCommandArray);
        }   
        
        return true;
    };
};
/**
* End Class EditableBase
**/


/**
* Class EditableGecko extends EditableBase
*
* Class to convert node to a rich text editing area for Gecko Layout engine based browsers, 
* such as FireFox, Camino, and Mozilla
**/
var EditableGecko = function()
{
    // designMode iframe editor reference
    this.iframe = null;
    
    // Constructor
    this.EditableGecko = function(){};
    
    // Snapshot of original node before editing, in case we need to look something up
    this.originalNode = null;
    
    // Overridden from base class, turn on editing for node
    this.editableOn = function(node)
    {
        if(!this.checkNodeType(node))
            return false;       
        
        // Build Iframe
        this.iframe = document.createElement("iframe");
        
        // Line up some properties      
        this.iframe.style.width = (node.style.width) ? node.style.width : "100%";
        this.iframe.style.height = (node.style.height) ? node.style.height : node.offsetHeight + "px";
        this.iframe.style.top = (node.style.top) ? node.style.top : this.iframe.style.top;
        this.iframe.style.left = (node.style.left) ? node.style.left : this.iframe.style.left; 
        if(node.style.position)
        {
            this.iframe.style.position = node.style.position;
            // Setting a position to static automatically ignores top and left attributes, so we don't need to change them
            node.style.position = "static";
        }
        this.iframe.style.border        = "none";
        this.iframe.style.lineHeight    = "0"; // squash line height
        this.iframe.style.verticalAlign = "bottom";
        this.iframe.scrolling           = "no";
                
        // Switch node with iframe
        clone = node.cloneNode(true);
        this.originalNode = node.cloneNode(true);
        node.parentNode.replaceChild(this.iframe, node);    
    
        // Add stub document to iframe write it in manually fo speed, a server GET request for a stub would take too long
        this.iframe.contentWindow.document.open('text/html; charset="UTF-8"');  
        // Copy over styles defined in docuemnt
        var styleText = "";
        if(document.getElementsByTagName('style'))
            styleText = "\n\n" + document.getElementsByTagName('style')[0].innerHTML + "\n\n";
        html =  "<html>" +
                "<head>" +
                "<style type='text/css'>\n" +               
                "body,html {\n" + 
                "   background:transparent;\n" +
                "   padding:0;\n" +
                "   margin:0;\n" +
                "}\n" +
                "body {\n" +
                "   top:0;\n" +
                "   left:0;\n" +
                "   right:0;\n" +
                "   position:fixed;\n" +
                "}\n" +     
                "body,div,dl,dt,dd,ul,ol,li,h1,h2,h3,h4,h5,h6,pre,form,fieldset,input,textarea,p,blockquote,th,td {\n" +
                "   margin:0;\n" +
                "   padding:0;\n" +
                "}\n" +
                "table {\n" +
                "   border-collapse:collapse;\n" +
                "   border-spacing:0;\n" +
                "}\n" +
                "fieldset,img {\n" +
                "   border:0;\n" +
                "}\n" +
                "address,caption,cite,code,dfn,em,strong,th,var {\n" +
                "   font-style:normal;\n" +
                "   font-weight:normal;\n" +
                "}\n" +
                "ol,ul {\n" +
                "   list-style:none;\n" +
                "}\n" +
                "caption,th {\n" +
                "   text-align:left;\n" +
                "}\n" +
                "h1,h2,h3,h4,h5,h6 {\n" +
                "   font-size:100%;\n" +
                "   font-weight:normal;\n" +
                "}\n" +
                "q:before,q:after {\n" +
                "   content:'';\n" +
                "}\n" +
                "abbr,acronym {\n" +
                "   border:0;\n" +
                "}\n" +             
                // Write in style text
                styleText +             
                "</style>" +
                "</head>" +             
                // The <div> is important, otherwise a <br/> is inserted then removed when typed on causing a jerky movement
                "<body><div></div></body>" +                
                "</html>";
        this.iframe.contentWindow.document.write(html);
        this.iframe.contentWindow.document.close();
        
        // Append cloned node to new document in iframe
        this.node = this.iframe.contentWindow.document.body.appendChild(clone); 
        
        // Add style sheets to retain look
        for ( i = document.styleSheets.length - 1; i>=0; i-- )
        {   
            var newLink = this.iframe.contentDocument.createElement("link");
            newLink.rel  = "stylesheet";
            newLink.type = "text/css";
            newLink.href = document.styleSheets[i].href;
            var iframeHead = this.iframe.contentDocument.getElementsByTagName('head')[0];
            if(iframeHead)
                iframeHead.appendChild(newLink);
        }
        
        // Switch on design mode
        this.iframe.contentWindow.document.designMode = "on";
        
        // Set reference to iframe document object
        this.doc = this.iframe.contentWindow.document;
                
        // Add height correction events     
        EditableGeckoRef = this; // Object reference for resize correction callback
        this.iframe.contentWindow.document.addEventListener('keyup', mozSignalIframeChange, true);
        this.iframe.contentWindow.document.addEventListener('mouseup', mozSignalIframeChange, true);
        this.iframe.contentWindow.addEventListener('resize', mozSignalIframeChange, true);
        
        // Call update to smooth out any samll inconsisencies
        this.update();  
    };
    
    // Overridden from base class, turn off editing for node
    this.editableOff = function()
    {
        if(this.iframe)
        {
            // Remove event listeners
            this.iframe.contentWindow.document.removeEventListener('keyup', mozSignalIframeChange, true);
            this.iframe.contentWindow.document.removeEventListener('mouseup', mozSignalIframeChange, true);
            this.iframe.contentWindow.removeEventListener('resize', mozSignalIframeChange, true);
            
            // Switch off design mode
            this.iframe.contentWindow.document.designMode = "off";
            
            // Straighten out properties
            this.node.style.width = (this.originalNode.style.width) ? this.iframe.style.width : this.originalNode.style.width;              
            this.node.style.height = (this.originalNode.style.height) ? this.iframe.style.height : this.originalNode.style.height;              
            this.node.style.position = this.iframe.style.position;
            this.node.style.top  = this.iframe.style.top;
            this.node.style.left = this.iframe.style.left;
            
            // Swap out nodes
            this.iframe.parentNode.replaceChild(this.node, this.iframe);
            
            // Clean up references
            this.iframe = null;
            this.node   = null;
            this.doc    = null;         
        }
    };
    
    // Called when a change is made, make iframe height corrections and recheck command state
    this.update = function()
    {
        this.checkCommandState();
        this.iframe.style.height = this.doc.body.offsetHeight + "px";
    };
    
    // Overridden from base class, focus() is necessary for reselection in Mozilla
    this.preExecCommand = function()
    {
        if(this.iframe)
            this.iframe.contentWindow.focus();
    };
    
    // Overridden from base class, call update to catch any changes
    this.postExecCommand = function()
    {
        this.update();
    }   
};
EditableGecko.prototype = new EditableBase;
// For Resize Correction, only way to pull it off.  Can't seem to pass object reference using 'this' into iframe.
// Keep function here becuase it is only used by class, if we put in class then we can't reference it from iframe
var EditableGeckoRef = null;

// This function is passed to iframe for call back on change
function mozSignalIframeChange()
{
    window.parent.geckoReceiveIframeChange();
}

// Correct the resize
function geckoReceiveIframeChange()
{
    if(EditableGeckoRef)
        EditableGeckoRef.update();
}
/**
* End Class EditableGecko
**/


/**
* Class EditableWebkit extends EditableBase
*
* Class to convert node to a rich text editing area for Webkit browsers
**/
var EditableWebkit = function()
{
    // Vars for holding shitty webkit equivalent to range, http://lists.apple.com/archives/Webcore-dev/2005/May/msg00007.html
    this.baseNode = null;
    this.baseOffset = null;
    this.extentNode = null;
    this.extentOffset = null;
    
    // Constructor
    this.EditableWebkit = function(){};
    
    // Overridden from base class, turn on edtiting for node
    this.editableOn = function(node)
    {
        if(!this.checkNodeType(node))
            return false;
        
        // Set node reference
        this.node = node;
        
        // Turn on content editable for node
        this.node.contentEditable = true;
        
        // Attach listeners
        this.node.addEventListener("keypress", webkitCacheSelection, true);
        this.node.addEventListener("mouseup", webkitCacheSelection, true);
        
        // Set Document reference
        this.doc = document;
        
        // Store reference for callback
        editableWebkitRef = this;
    };
    
    // Overridden from base class, turn off edting for node
    this.editableOff = function()
    {
        // Detach listerners
        this.node.removeEventListener("keypress", webkitCacheSelection, true);
        this.node.removeEventListener("mouseup", webkitCacheSelection, true);
    
        // Turn off content editable for node
        this.node.contentEditable = false;

        // Clean up references
        this.node = null;
        this.doc = null;
    }   
    
    // Cache highlighted selection
    this.cacheSelection = function()
    {
        // Get Selection object, http://lists.apple.com/archives/Webcore-dev/2005/May/msg00007.html
        var selection = window.getSelection();  
        this.baseNode     = selection.baseNode;
        this.baseOffset   = selection.baseOffset;
        this.extentNode   = selection.extentNode;
        this.extentOffset = selection.extentOffset;
    }
    
    // Re-highlight previous cached selection
    this.highlightSelection = function()
    {
        // Essentially generate new selection, then move it, Webkit sucks, this is the only way I can find to do it
        // http://lists.apple.com/archives/Webcore-dev/2005/May/msg00007.html
        var selection = window.getSelection();
        selection.setBaseAndExtent(this.baseNode, this.baseOffset, this.extentNode, this.extentOffset);
    };
    
    // Called when change is made, re-cache selection as range proably changed and check command state
    this.update = function()
    {
        this.cacheSelection();
        this.checkCommandState();
    };
    
    // Overridden from base class, re-highlight selection as it is lost when the user clicks somewhere outside of selection
    this.preExecCommand = function()
    {
        this.highlightSelection();
    };
    
    // Overridden from base class, call update to catch any changes
    this.postExecCommand = function()
    {
        this.update();
    };
};
EditableWebkit.prototype = new EditableBase;

// You cannot pass object methods by reference, this will act as reference to current object
var editableWebkitRef = null;

// Call cache selection method
function webkitCacheSelection()
{
    if(editableWebkitRef)
        editableWebkitRef.update();
}
/**
* End Class EditableWebkit
**/


/**
* Class EditableIE extends EditableBase
*
* Class to convert a node to a rich text editing area in Internet Explorer
**/
var EditableIE = function()
{
    // Cached Range
    this.cachedRange = null;
    
    // Cached Inner Text of element for comparison 
    this.cachedInnerText = null;
    
    // Constructor
    this.EditableIE = function(){};
    
    // Overridden from base class, turn on editing for node
    this.editableOn = function(node)
    {
        if(!this.checkNodeType(node))
            return false;
        
        // Set node reference
        this.node = node;
        
        // Turn on content eidtable for node
        this.node.contentEditable = true;
        
        // Attach listeners
        this.node.attachEvent("onkeypress", iECacheSelection);
        this.node.attachEvent("onmouseup", iECacheSelection);
        
        // Set document reference
        this.doc = document;
        
        // Store reference for callback
        editableIERef = this;
    };
    
    // Overridden from base class, turn off editing for node
    this.editableOff = function()
    {
        // Detach listeners
        this.node.detachEvent("onkeypress", iECacheSelection);
        this.node.detachEvent("onmouseup", iECacheSelection);
    
        // Turn off content editable for node
        this.node.contentEditable = false;
        
        // Clean up references
        this.node = null;       
        this.doc = null;        
    };
    
    // Cache highlighted selection
    this.cacheSelection = function()
    {
        if(document.selection)
        {
            this.cachedRange = this.doc.selection.createRange();
            this.cachedInnerText = this.node.innerText;
        }
    };
    
    // Re-highlight previously cached selection
    this.highlightSelection = function()
    {
        // We cached a range earlier to maintain hightlighting after selecting text, what happens in IE is if you
        // start typing at the end of a paragraph and then change the focus by pressing on a button elsewhere
        // in the app the selection is cached automatically adjusts to include your new text.  
        // So the best way is to cache the selection text(cachedInnerText) the first time to see if anything has
        // has changed, if so move the cursor to the end using the the only way possible with the exposed methods
        // take the length of the text range and move there.  Thus you give the appearance that the whole
        // text range bug thing didn't happen without messing up existing highlight functionality.
        if(this.cachedInnerText != this.node.innerText && this.cachedRange && this.cachedRange.text.length >= 0)
            this.cachedRange.moveStart("character", this.cachedRange.text.length);      

        // Re-select Range
        if(this.cachedRange)
            this.cachedRange.select();
    };
    
    // Called when change is made, re-cache selection as range proably changed and check command state
    this.update = function()
    {
        this.cacheSelection();
        this.checkCommandState();
    };
    
    // Overridden from base class, re-highlight selection as it is lost when the user clicks somewhere outside of selection
    this.preExecCommand = function()
    {
        this.highlightSelection();
    };
    
    // Overridden from base class, call update to catch any changes
    this.postExecCommand = function()
    {
        this.update();
    };
};
EditableIE.prototype = new EditableBase;

// You cannot pass object methods by reference, this will act as reference to current object
var editableIERef= null;

// Call cache selection method
function iECacheSelection()
{
    if(editableIERef)
        editableIERef.update();
}
/**
* End Class EditableIE
**/
