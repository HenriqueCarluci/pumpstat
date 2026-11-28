package com.henriquecarluci.stepclub;

import android.os.Bundle;
import android.view.View;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // compartilhar várias imagens de uma vez (o @capacitor/share só levava o texto)
        registerPlugin(ShareImagesPlugin.class);
        super.onCreate(savedInstanceState);
        // sem o efeito de "esticar" no fim da rolagem (Android 12+): ele arrastava a barra de baixo junto
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
        }
    }
}
