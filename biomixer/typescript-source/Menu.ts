export class Menu {

    static defaultMenuName = "Menu";
    static menuClosedPrefix = "Show ";
    static menuOpenPrefix = "Hide ";
    
    static mainMenuButtonClass = "mainMenuButtonIcon";
    
    static menuExpanderButtonClass = "menuExpanderButton";
        
    static openActionClass = "menuLabelIconOpenAction";
    
    static closeActionClass = "menuLabelIconCloseAction";
    
    static menuLabelClass = "menuLabel";

    static expandableMenuLabelClass = "expandableMenuLabel";
    
    static menuItemExpanderLabelClass = "mainMenuLabelExpander";
    
    static menuId: string = 'hoveringGraphMenu';
    
    static menuBarSelector: string = "#top_menu_bar";
    
    static topBarButtonClass = "topBarButton";
    
    static menuTriggerContainerId = "menuTriggerContainer";
    
    static triggerId = "trigger";
    
    static hidingMenuContainerClass = "hidingMenu";
    
    static menuMadeVisibleCallbacks: Array<{():void}> = [];
    
    private menuName: string = "";

    
    initializeMenu(menuName: string = Menu.defaultMenuName){
        this.menuName = menuName;
        // Append the pop-out panel. It will stay hidden except when moused over.
        var trigger = $("<div>").attr("id", Menu.menuTriggerContainerId)
            .addClass(Menu.topBarButtonClass)    
        ;
        $(Menu.menuBarSelector).append(trigger);
        trigger.append(
            $("<div>").attr("id", Menu.triggerId)
                .addClass("unselectable")
                .text("Menu")
                .append(
                    $("<div>")
                    .css("float", "right")
                    .addClass("unselectable")
                    .addClass(Menu.mainMenuButtonClass)
                )
            )
            ;
        trigger.append($("<div>").attr("id", Menu.menuId));
        
        // Opted for click control only
        //$(Menu.triggerId).hover(
        //        (e) => {
        //            $(this.menuSelector).show(); //.css('top', e.pageY).css('left', e.pageX);
        //             // Looks bad when it's not fully visible, due to children inheriting transparency
        //            $(this.menuSelector).fadeTo(0, 1.0);
        //        },
        //        function() {
        //        //  $(menuSelector).hide();
        //        }
        //);
        var outerThis = this;
        $("#"+Menu.triggerId).click(
            (event)=>{
            	event.stopPropagation();
                outerThis.toggleMenu();
            }
        );
        
        
        this.updateMenuText();
    }
    
    updateMenuText(){
        if($("#"+Menu.menuId).css("display") === "none"){
            $("#"+Menu.triggerId).removeClass("pressedMenuButton");
            $("#"+Menu.triggerId).attr("title", Menu.menuClosedPrefix+this.menuName);
        } else {
            $("#"+Menu.triggerId).addClass("pressedMenuButton");
            $("#"+Menu.triggerId).attr("title", Menu.menuOpenPrefix+this.menuName);
        }
        
        for(var i in Menu.menuMadeVisibleCallbacks){
            Menu.menuMadeVisibleCallbacks[i]();
        }
    }
    
    toggleMenu(){
        $("#"+Menu.menuId).slideToggle({ duration: "fast", complete: ()=>{this.updateMenuText();} });
    }
    
    openMenu(){
        $("#"+Menu.menuId).slideDown({ duration: 0, complete: ()=>{this.updateMenuText();} });
    }
    
    closeMenuLambda(){
        return ()=>{
            $("#"+Menu.menuId).slideUp({ duration: 0, complete: ()=>{this.updateMenuText();} });
        };
    }
    
    getMenuSelector(){
        return "#"+Menu.menuId;
    }
    
    getMenuBarSelector(){
        return Menu.menuBarSelector;
    }
    
    /**
     * Creates a menu panel that has an outer visible div with a header, that when clicked, shows or hides an inner div.
     * To use, call with appropriate arguments, then use the returned object as follows:
     * 1) attach the outer element to the menu or other html container of your choice. This outer element is always visible.
     * 2) attach your menu's elements to the inner element. They will be shown or hidden.
     */
     static slideToggleHeaderContainer(outerContainerId: string, innerContainerId:string, labelText: string, defaultHideContainer?:boolean, visibleCallback?: {():void}): {outer: JQuery; inner: JQuery; expanderCallback: (open?: boolean, whenComplete?: () => void) => void; } {
        if(null != visibleCallback){
            Menu.menuMadeVisibleCallbacks.push(visibleCallback);
        }
         
        var outerContainer = $("<div>").attr("id", outerContainerId);
        var innerHidingContainer = $("<div>").attr("id", innerContainerId).addClass(Menu.hidingMenuContainerClass);
        
        if(defaultHideContainer){
            innerHidingContainer.css("display", "none");
        }
        
        
        // This only indicates collapsability and status
        var labelExpanderIcon = $("<label>")
            .addClass(Menu.menuItemExpanderLabelClass)
            .addClass(Menu.menuExpanderButtonClass)
            .addClass("unselectable").attr("unselectable", "on") // IE8
            ;
    
        var expanderIndicatorUpdateLambda = (whenComplete?: ()=>void) => {
            return ()=>{
                if($(innerHidingContainer).css("display") === "none"){
                    labelExpanderIcon.addClass(Menu.openActionClass);
                    labelExpanderIcon.removeClass(Menu.closeActionClass);
                } else {
                    labelExpanderIcon.removeClass(Menu.openActionClass);
                    labelExpanderIcon.addClass(Menu.closeActionClass);
                }
                if(null != whenComplete){
                    whenComplete();
                }
            }
        };
        
        // The label labels the section, and acts as a huge collapse button
        var label = $("<label>").addClass(Menu.menuLabelClass)
            .addClass("unselectable").attr("unselectable", "on") // IE8
            .addClass(Menu.expandableMenuLabelClass)
            .text(labelText);
     
        var expanderClickFunction = (open?: boolean, whenComplete?: ()=>void)=>{
            // Used for the button, as well as for a programmatic callback for when we want to display the submenu
            // for special purposes.
            if(null != open){
                if(open){
                    $(innerHidingContainer).slideDown('fast', expanderIndicatorUpdateLambda(whenComplete));
                } else {
                    $(innerHidingContainer).slideUp('fast', expanderIndicatorUpdateLambda(whenComplete));
                }
            } else {
                // Don't have a preference of what to do? Toggle it.
                $(innerHidingContainer).slideToggle('fast', expanderIndicatorUpdateLambda(whenComplete));
            }
        }; 
        
        labelExpanderIcon.click(
            (event, whenComplete?: ()=>void)=>{
                expanderClickFunction(undefined, whenComplete);
            }
        );
        label.click(
            (event, whenComplete?: ()=>void)=>{
                expanderClickFunction(undefined, whenComplete);
            }
        );
    
        outerContainer.append(labelExpanderIcon);
        outerContainer.append(label);
        
        // We don't know the default necessarily, so set the icon here.
        expanderIndicatorUpdateLambda()();

        outerContainer.append(innerHidingContainer);
        
        return {outer: outerContainer, inner: innerHidingContainer, expanderCallback: expanderClickFunction };
    }
    
}