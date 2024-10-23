# Install 

``` shell
npm i
```


# Setup private key 

Add PK field to you .env key
``` shell
PK="you private key in base64"
```

# Create dwallet 

``` shell
npx ts-node createAccount.ts
```


Copy output to .env file 

# Create signature and send to bitcoin test net 

``` shell
npx ts-node bira.ts
```

