/* FLASH7 presentation: shared/layout.js. Classic-script globals preserve the shared runtime contract. */
    const MOBILE_PANEL_MEDIA = window.matchMedia("(max-width: 900px) and (orientation: landscape), (max-width: 600px)");
    const PHONE_LANDSCAPE_MEDIA = window.matchMedia("(orientation: landscape) and (max-width: 900px)");
    const TABLET_CONTROLS_MEDIA = window.matchMedia("(min-width: 768px) and (max-width: 1440px)");
    const DESKTOP_LAYOUT_MEDIA = window.matchMedia("(min-width: 768px) and (pointer: fine)");

    function isForcedMobileHudPreview(){
      return !!(uiSettings && uiSettings.mobileHudPreview && PHONE_LANDSCAPE_MEDIA.matches && isTouchCapableDevice());
    }

    function isMobileLayout(){
      return isForcedMobileHudPreview() || (MOBILE_PANEL_MEDIA.matches && isTouchCapableDevice());
    }

    function isDesktopLayout(){
      return DESKTOP_LAYOUT_MEDIA.matches;
    }

    function isTouchCapableDevice(){
      if((navigator.maxTouchPoints || 0) > 0) return true;
      if("ontouchstart" in window) return true;
      if(window.matchMedia){
        if(window.matchMedia("(pointer: coarse)").matches) return true;
        if(window.matchMedia("(any-pointer: coarse)").matches) return true;
      }
      const ua = String((navigator && navigator.userAgent) || "");
      return /Android|iPhone|iPad|iPod|Windows Phone|IEMobile|Opera Mini|Mobile/i.test(ua);
    }

    function isTabletControlsLayout(){
      return !isMobileLayout() && TABLET_CONTROLS_MEDIA.matches && isTouchCapableDevice();
    }
