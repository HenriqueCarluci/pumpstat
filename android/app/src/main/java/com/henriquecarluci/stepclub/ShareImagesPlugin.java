package com.henriquecarluci.stepclub;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.ArrayList;

/**
 * Compartilha uma ou mais imagens pela folha do Android.
 * O @capacitor/share manda várias imagens como Serializable (putExtra) e sem ClipData, e os apps
 * de destino recebiam só o texto; aqui vai como lista Parcelable, com permissão de leitura para todas.
 */
@CapacitorPlugin(name = "ShareImages")
public class ShareImagesPlugin extends Plugin {
    @PluginMethod
    public void share(PluginCall call) {
        JSArray files = call.getArray("files");
        String text = call.getString("text");
        String title = call.getString("title", "Compartilhar");
        ArrayList<Uri> uris = new ArrayList<>();
        try {
            if (files != null) {
                for (Object o : files.toList()) {
                    String path = Uri.parse(String.valueOf(o)).getPath();
                    uris.add(FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", new File(path)));
                }
            }
        } catch (Exception e) {
            call.reject(e.getLocalizedMessage());
            return;
        }
        if (uris.isEmpty()) {
            call.reject("Nenhuma imagem para compartilhar");
            return;
        }
        Intent intent = new Intent(uris.size() > 1 ? Intent.ACTION_SEND_MULTIPLE : Intent.ACTION_SEND);
        intent.setType("image/png");
        if (uris.size() > 1) intent.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
        else intent.putExtra(Intent.EXTRA_STREAM, uris.get(0));
        ClipData clip = ClipData.newRawUri("", uris.get(0));
        for (int i = 1; i < uris.size(); i++) clip.addItem(new ClipData.Item(uris.get(i)));
        intent.setClipData(clip);
        if (text != null && !text.isEmpty()) intent.putExtra(Intent.EXTRA_TEXT, text);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(intent, title);
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().startActivity(chooser);
        call.resolve();
    }
}
