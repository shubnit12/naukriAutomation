import { test, expect, Page } from '@playwright/test';

test.use({
    launchOptions: {
        args: [
            '--deny-permission-prompts',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ],
    },
})
const TOKEN = process.env.TOKEN;
const CHAT_ID = process.env.CHAT_ID;
test.use({ storageState: 'state.json' });
let successfullyApplied = 0
let TotalJobsFound = 0
test('has title', async ({ page, context }) => {
    console.log("Telegram : " , TOKEN, CHAT_ID)
      await page.goto('https://www.naukri.com/');
      await page.waitForTimeout(1000)
      await page.getByRole('button', { name: 'Search jobs here' }).click();
      await page.waitForTimeout(1000)
      await page.getByRole('textbox', { name: 'Enter keyword, designation,' }).fill('nodejs, Node.js, Node Js Developer,');
      await page.waitForTimeout(1000)
      await page.getByRole('textbox', { name: 'Select experience' }).click();
      await page.waitForTimeout(1000)
      await page.locator('div').filter({ hasText: /^4 years$/ }).click();
      await page.waitForTimeout(1000)
      await page.getByRole('button', { name: 'Search' }).click();
      await page.waitForTimeout(1000)
      await page.getByText('FreshnessSelectLast 30').click();
      await page.waitForTimeout(1000)
      await page.getByRole('button', { name: 'Select ' }).click();
      await page.waitForTimeout(1000)
      await page.locator('a').filter({ hasText: 'Last 1 day' }).click();
      await page.waitForTimeout(1000)
    //   await page.locator('label').filter({ hasText: 'Engineering - Software' }).nth(0).click();
    //   await page.waitForTimeout(1000)
    //   await page.locator('label').filter({ hasText: 'Development' }).nth(0).click()
    //   await page.waitForTimeout(1000)
    //   await page.getByRole('button', { name: 'Recommended ' }).click()
      await page.waitForTimeout(1000)
    //   await page.locator('a').filter({ hasText: /^Date$/ }).click()
    //   await page.locator('a').filter({ hasText: 'Relevance' }).click()
      await page.waitForTimeout(3000)

      let jobcards = await page.locator('.srp-jobtuple-wrapper').all()
      console.log("jobcards length = " , jobcards);
      


        for(let j=1;j<10;j++){
            await page.waitForTimeout(1000)
            if(j===1){
                console.log("first page")
            }else{
                console.log("Page Number = " , j)
                await page.waitForTimeout(1000)
                await page.getByRole('link', { name: `${j}`, exact: true }).click()
                await page.waitForTimeout(1000)
            }
    
            for(let i=0;i<jobcards.length;i++){
                let JobCardInnertext =  await page.locator('.srp-jobtuple-wrapper').nth(i).allInnerTexts()
                let isThisReleventJob = await hasNode(JobCardInnertext)
                console.log("isThisReleventJob : ", isThisReleventJob)
                if(!isThisReleventJob){
                continue;
               }
               TotalJobsFound = TotalJobsFound+1 
                const [jobTab] = await Promise.all([
                    context.waitForEvent('page'),
                    await page.locator('.srp-jobtuple-wrapper').nth(i).click()
                ]);
                try {
                    //   await jobTab.locator('#apply-button').click({ timeout: 5000 })
                    await jobTab.getByRole('button', { name: 'Apply', exact: true }, ).click({ timeout: 15000 })
                } catch (error) {
                    await jobTab.close()
                    continue;
                }
                try {
                    await expect(jobTab.getByText('Applied to')).toBeVisible({ timeout: 10000 });
                    // await page.pause()
                    console.log("Applied Successfull")
                    successfullyApplied = successfullyApplied+1
                    await jobTab.close()
                    continue;

                } catch (error) {
                    try {
                        await expect(jobTab.locator('.chatbot_DrawerContentWrapper')).toBeVisible()
                        console.log("Chat Box is opened")
                        // await page.pause()
                        //complete chat box function
                        await completeChatBox(jobTab)
                          console.log("Applied Successfull")

                        successfullyApplied = successfullyApplied+1
                        await jobTab.close()

                    } catch (error) {
                        // await page.pause()

                    }

                }
            }
        }
       
    // await page.pause()


});

test.afterAll(async () => {
    console.log(`Total Number of Jobs were = ${TotalJobsFound}, and successfully applied were ${successfullyApplied}`)
    await sendTelegramAlert(`Total Number of Jobs were = ${TotalJobsFound}, and successfully applied were ${successfullyApplied}`)
    
  });
async function completeChatBox(page: Page) {
    while (true) {
        try {
            await expect(page.getByText('Applied to')).toBeVisible({ timeout: 5000 });
            break;
        } catch (error) {
        }
        // await page.pause()
        const parent = page.locator('.sendMsg').locator('..');
        const clsOfSendButton = await parent.getAttribute('class');

        if (clsOfSendButton?.includes('disabled')) {
            console.log('Send button is disabled');

            let currentInputFieldType = await currentInputType(page)
            console.log("currentInputFieldType : ", currentInputFieldType)
            if(currentInputFieldType!="textInputBox"){
                if(currentInputFieldType=="singleSelectRadioBox"){
                    await selectOneOption(page)
                }
                if(currentInputFieldType=="multiSelectRadioBox"){
                    await selectAllOption(page)
                }
            
            }else{
                //chat input logic
                let inputFieldQuestion = await currentInputContentforInputBox(page)
                console.log("currentLastQuestionVisible for input box: " , inputFieldQuestion)

                    if (inputFieldQuestion.toLowerCase().includes('experience') || inputFieldQuestion.toLowerCase().includes('exp')) {
                        await page.locator(".textArea").click()
                        await page.locator(".textArea").fill('3.5')
                        // await page.pause()
                    }else
                    if (inputFieldQuestion.toLowerCase().includes('Notice') || inputFieldQuestion.toLowerCase().includes('LWD') || inputFieldQuestion.toLowerCase().includes('serv')) {
                        await page.locator(".textArea").click()
                        await page.locator(".textArea").fill('30')
                        // await page.pause()
                    }else
                    if (inputFieldQuestion.toLowerCase().includes('location')) {
                        await page.locator(".textArea").click()
                        await page.locator(".textArea").fill('Gurugram')
                        // await page.pause()
                    }else
                    if (inputFieldQuestion.toLowerCase().includes('relocate') || inputFieldQuestion.toLowerCase().includes('Understanding'))  {
                        await page.locator(".textArea").click()
                        await page.locator(".textArea").fill('Yes')
                        // await page.pause()
                    }else
                    if (inputFieldQuestion.toLowerCase().includes('ready')){
                        await page.locator(".textArea").click()
                        await page.waitForTimeout(2000)
                        await page.locator(".textArea").fill('Yes')
                    }else
                    if(inputFieldQuestion.toLowerCase().includes('availability')){
                        await page.locator(".textArea").click()
                        await page.waitForTimeout(2000)
                        await page.locator(".textArea").fill('Yes')
                    }else
                    if(inputFieldQuestion.toLowerCase().includes('worked')){
                        await page.locator(".textArea").click()
                        await page.waitForTimeout(2000)
                        await page.locator(".textArea").fill('Yes')
                    }else
                    if(inputFieldQuestion.toLowerCase().includes('projects') || inputFieldQuestion.toLowerCase().includes('interview')){
                        await page.locator(".textArea").click()
                        await page.waitForTimeout(2000)
                        await page.locator(".textArea").fill('Yes')
                    }else if(inputFieldQuestion.toLowerCase().includes('Name')){
                        await page.locator(".textArea").click()
                        await page.waitForTimeout(2000)
                        await page.locator(".textArea").fill('Shubnit')
                    }else if(inputFieldQuestion.toLowerCase().includes('Birth')){
                        await page.locator(".textArea").click()
                        await page.waitForTimeout(2000)
                        await page.locator(".textArea").fill('12/01/1999')
                    }
                    else if(inputFieldQuestion.toLowerCase().includes('Phone') || inputFieldQuestion.toLowerCase().includes('Number')){
                        await page.locator(".textArea").click()
                        await page.waitForTimeout(2000)
                        await page.locator(".textArea").fill('9802800431')
                    }else if(inputFieldQuestion.toLowerCase().includes('interested')){
                        await page.locator(".textArea").click()
                        await page.waitForTimeout(2000)
                        await page.locator(".textArea").fill('Yes')
                    }
                    else
                        {
                        await page.locator(".textArea").click()
                        await page.waitForTimeout(2000)
                        await page.locator(".textArea").fill('NA')
                    }
                    
                
            }

        } else {
            // await page.pause()
            await page.locator('.sendMsg').click()

        }
    }
}


async function currentInputType(page: Page){

    let inputType = ""
    const child = page.locator('.footerInputBoxWrapper').locator('> *').first();
    const childClass = await child.getAttribute('class');
    console.log('child class:', childClass);
    // await page.pause()
    if (childClass?.toLocaleLowerCase().includes('d-none')) {
        console.log("No Inuput box, might be Radio btton")
        const container = page.locator('.chatbot_MessageContainer').first();
        const children = container.locator('> *');
        const count = await children.count();
        const classArray = []
        for (let i = 0; i < count; i++) {
            // console.log(`child ${i} class:`, await children.nth(i).getAttribute('class'));
            classArray.push(await children.nth(i).getAttribute('class'))
        }
        // await page.pause()

        console.log("classArray : ", classArray)
        const selectionType = classArray[1];
        if (selectionType?.includes('single')) {
            console.log('single select radio box');
            inputType = "singleSelectRadioBox"
        } else if (selectionType?.includes('multi')) {
            console.log('multi select radio box');
            inputType = "multiSelectRadioBox"
        }else{
            throw new Error(`some wierd type of selector came : ${JSON.stringify(classArray)}`)
        }

    } else {
        // await page.pause()
        inputType = "textInputBox"
        console.log("Yes This is Input Box")
    }
    return inputType;

}

async function currentInputContentforRadio(page: Page){
    const container = page.locator('.chatbot_MessageContainer').first();
    const children = container.locator('> *');
    const count = await children.count();
    const classArray = []
    for (let i = 0; i < count; i++) {
        // console.log(`child ${i} class:`, await children.nth(i).getAttribute('class'));
        classArray.push(await children.nth(i).getAttribute('class'))
    }
    // await page.pause()

    console.log("classArray : ", classArray)


    const selectionTypeQuestion = classArray[0];
    let currentQuestionVisible = await page.locator(`.${selectionTypeQuestion} li`).last().allInnerTexts()
   

    const selectionTypeOptions = classArray[1];
    let currentOptionsVisible = await page.locator(`.${selectionTypeOptions}`).allInnerTexts()
    console.log("currentOptionsVisible in radio: " , currentOptionsVisible)
    return [currentQuestionVisible , currentOptionsVisible]
    
}

async function currentInputContentforInputBox (page: Page){
    const container = page.locator('.chatbot_MessageContainer').first();
    const children = container.locator('> *');
    const count = await children.count();
    const classArray = []
    for (let i = 0; i < count; i++) {
        // console.log(`child ${i} class:`, await children.nth(i).getAttribute('class'));
        classArray.push(await children.nth(i).getAttribute('class'))
    }
    // await page.pause()

    console.log("classArray : ", classArray)


    const selectionTypeQuestion = classArray[0];
    let currentQuestionVisible = await page.locator(`.${selectionTypeQuestion} li`).last().allInnerTexts()
    return currentQuestionVisible[currentQuestionVisible.length -1]

}

async function selectAllOption(page: Page){
    const container = page.locator('.chatbot_MessageContainer').first();
    const children = container.locator('> *');
    const count = await children.count();
    const classArray = []
    for (let i = 0; i < count; i++) {
        // console.log(`child ${i} class:`, await children.nth(i).getAttribute('class'));
        classArray.push(await children.nth(i).getAttribute('class'))
    }
    // await page.pause()

    console.log("classArray : ", classArray)

    const selectionTypeOptions = classArray[1];
    let currentOptionsVisible = await page.locator(`.${selectionTypeOptions} label`).all()
    console.log("currentOptionsVisible : ", currentOptionsVisible)
    await currentOptionsVisible[0].hover()
    
    for (const element of currentOptionsVisible) {
        await element.click();
    }
}
async function selectOneOption(page: Page){
    const container = page.locator('.chatbot_MessageContainer').first();
    const children = container.locator('> *');
    const count = await children.count();
    const classArray = []
    for (let i = 0; i < count; i++) {
        // console.log(`child ${i} class:`, await children.nth(i).getAttribute('class'));
        classArray.push(await children.nth(i).getAttribute('class'))
    }
    // await page.pause()

    console.log("classArray : ", classArray)

    const selectionTypeOptions = classArray[1];
    let singleSelectOptions = await page.locator(`.${selectionTypeOptions} label`).all()
    console.log("singleSelectOptions : ", singleSelectOptions)
    for (const element of singleSelectOptions) {
        const text = (await element.innerText()).trim().toLowerCase();


        const textSkip = (await element.innerText()).toLowerCase();
        if (text.includes('yes')) {
            await element.click();
            break;
        }else if (textSkip.includes('skip')) {
            await element.click();
            break;
        }else{
            await element.click();
            break;
        }
    }

    // await page.locator(`.${selectionTypeOptions} label`).first().click()
    
}

async function hasNode(textArray: string[]) {
    const text = textArray.join(' ').toLowerCase();
    return ['node', 'js', 'javascript'].some(keyword => text.includes(keyword));
}


async function sendTelegramAlert(text:any) {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: CHAT_ID, text }),
    });
    console.log("text ---> ", text)
}
