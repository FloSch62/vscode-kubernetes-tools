import * as vscode from 'vscode';
import * as path from 'path';
import * as shelljs from 'shelljs';

export interface HostKubeconfigPath {
    readonly pathType: 'host';
    readonly hostPath: string;
}

export interface WSLKubeconfigPath {
    readonly pathType: 'wsl';
    readonly wslPath: string;
}

export type KubeconfigPath = HostKubeconfigPath | WSLKubeconfigPath;

export async function loadKubeconfig(): Promise<any> {
    const kubernetes = await import('@kubernetes/client-node');
    const kubeconfig = new kubernetes.KubeConfig();
    const kubeconfigPath = getKubeconfigPath();

    if (kubeconfigPath.pathType === 'host') {
        kubeconfig.loadFromFile(kubeconfigPath.hostPath);
    } else if (kubeconfigPath.pathType === 'wsl') {
        const result = shelljs.exec(`wsl.exe sh -c "cat ${kubeconfigPath.wslPath}"`, { silent: true }) as shelljs.ExecOutputReturnValue;
        if (!result) {
            throw new Error(`Impossible to retrieve the kubeconfig content from WSL at path '${kubeconfigPath.wslPath}'. No result from the shelljs.exe call.`);
        }

        if (result.code !== 0) {
            throw new Error(`Impossible to retrieve the kubeconfig content from WSL at path '${kubeconfigPath.wslPath}. Error code: ${result.code}. Error output: ${result.stderr.trim()}`);
        }

        kubeconfig.loadFromString(result.stdout.trim());
    } else {
        throw new Error(`Kubeconfig path type is not recognized.`);
    }

    return kubeconfig;
}

export function getKubeconfigPath(): KubeconfigPath {
    // Check if the user has configured to use WSL
    const useWsl = vscode.workspace.getConfiguration().get<boolean>("vs-kubernetes.use-wsl", false);
    
    // Check if user has specified a kubeconfig path
    let kubeconfigPath: string | undefined = vscode.workspace.getConfiguration().get<string>("vs-kubernetes.kubeconfig");

    if (useWsl) {
        if (!kubeconfigPath) {
            // User is using WSL: we want to use the same default that kubectl uses on Linux ($KUBECONFIG or home directory).
            const result = shelljs.exec('wsl.exe sh -c "echo ${KUBECONFIG:-$HOME/.kube/config}"', { silent: true }) as shelljs.ExecOutputReturnValue;
            if (!result) {
                throw new Error(`Impossible to retrieve the kubeconfig path from WSL. No result from the shelljs.exe call.`);
            }

            if (result.code !== 0) {
                throw new Error(`Impossible to retrieve the kubeconfig path from WSL. Error code: ${result.code}. Error output: ${result.stderr.trim()}`);
            }
            kubeconfigPath = result.stdout.trim();
        }
        return {
            pathType: 'wsl',
            wslPath: kubeconfigPath
        };
    }

    if (!kubeconfigPath) {
        kubeconfigPath = process.env['KUBECONFIG'];
    }
    if (!kubeconfigPath) {
        // Fall back on the default kubeconfig value.
        kubeconfigPath = path.join((process.env['HOME'] || process.env['USERPROFILE'] || '.'), ".kube", "config");
    }
    return {
        pathType: 'host',
        hostPath: kubeconfigPath
    };
}